import { describe, expect, test } from "vitest";

import { expectRtkParity, filterRtkOutput } from "../../helpers/rtkCommandHarness.js";

describe("RTK docker behavior", () => {
  // RTK: cloud/container.rs::format_compose_ps + test_format_compose_ps_basic /
  // _long_image_path / _no_ports / _exited_service. Tab-separated --format rows
  // "Name\tImage\tStatus\tPorts"; image shortened to last path segment, empty
  // ports drop the bracket suffix.
  test("compose ps keeps service status and strips long image registry prefixes", async () => {
    const result = await filterRtkOutput(
      ["docker", "compose", "ps"],
      [
        "web\tghcr.io/example/very/long/web:latest\tUp 2 hours\t0.0.0.0:8080->80/tcp",
        "api\tghcr.io/example/very/long/api:latest\tUp 2 hours\t0.0.0.0:3000->3000/tcp",
        "db\tpostgres:16\tExited (0)\t",
      ].join("\n"),
    );

    expectRtkParity(result, {
      critical: ["web", "api", "db", "Up 2 hours"],
      forbidden: [/ghcr\.io\/example\/very\/long/, /\] \[/],
      exact: [
        "[compose] 3 services:",
        "  web (web:latest) Up 2 hours [8080]",
        "  api (api:latest) Up 2 hours [3000]",
        "  db (postgres:16) Exited (0)",
      ].join("\n"),
    });
  });

  // RTK: cloud/container.rs::format_compose_ps truncates past CAP_LIST (20)
  // services and appends "  … +N more".
  test("compose ps truncates past CAP_LIST and reports the overflow count", async () => {
    const rows = Array.from(
      { length: 25 },
      (_, i) => `svc-${i}\tnginx:latest\tUp 1 hour\t0.0.0.0:${8000 + i}->80/tcp`,
    ).join("\n");

    const result = await filterRtkOutput(["docker", "compose", "ps"], rows);

    expectRtkParity(result, {
      critical: ["[compose] 25 services:", "  svc-0 (nginx:latest) Up 1 hour [8000]", "  … +5 more"],
      forbidden: [/svc-20 /, /svc-24 /],
      minTokenSavingsRatio: 0.1,
    });
  });

  // RTK: cloud/container.rs::format_compose_build + test_format_compose_build_basic.
  // Emits the FINISHED summary line, unique service names from "[svc N/M]"
  // steps, and the count of " => " steps.
  test("compose build collapses the build graph to summary, services, and step count", async () => {
    const raw = [
      "[+] Building 12.3s (8/8) FINISHED",
      " => [web internal] load build definition from Dockerfile           0.0s",
      " => [web internal] load metadata for docker.io/library/node:20     1.2s",
      " => [web 1/4] FROM docker.io/library/node:20@sha256:abc123         0.0s",
      " => [web 2/4] WORKDIR /app                                         0.1s",
      " => [web 3/4] COPY package*.json ./                                0.1s",
      " => [web 4/4] RUN npm install                                      8.5s",
      " => [web] exporting to image                                       2.3s",
      " => => naming to docker.io/library/myapp-web                       0.0s",
    ].join("\n");

    const result = await filterRtkOutput(["docker", "compose", "build"], raw);

    expectRtkParity(result, {
      critical: ["[compose] [+] Building 12.3s (8/8) FINISHED", "  Services: web", "  Steps: 8"],
      minTokenSavingsRatio: 0.5,
    });
  });

  // RTK: cloud/container.rs::docker_ps + format_container_line_from_parts.
  // tg receives the `--format "{{.ID}}\t{{.Names}}\t{{.Status}}\t{{.Image}}\t{{.Ports}}"`
  // stdout RTK produces internally: id truncated to 12 chars, image last segment.
  test("docker ps shortens ids/images and brackets compacted ports", async () => {
    const result = await filterRtkOutput(
      ["docker", "ps"],
      [
        "0123456789abcdefffff\tweb\tUp 2 hours\tghcr.io/org/web:latest\t0.0.0.0:8080->80/tcp",
        "fedcba9876543210aaaa\tredis\tUp 5 hours\tredis:7\t",
      ].join("\n"),
    );

    expectRtkParity(result, {
      critical: [
        "[docker] 2 containers:",
        "  0123456789ab web (web:latest) Up 2 hours [8080]",
        "  fedcba987654 redis (redis:7) Up 5 hours",
      ],
      forbidden: [/0123456789abcdef/, /ghcr\.io\/org/],
    });
  });

  // RTK: cloud/container.rs::docker_ps_all — first column is State; running/
  // restarting group under "running:", others under "stopped/exited:". Uses a
  // large fleet so the regrouped summary beats the verbose `--format` dump.
  test("docker ps -a splits running from stopped using the State column", async () => {
    const rows: string[] = [
      "running\t0123456789abcdef0000\tweb\tUp 2 hours\tregistry.example.com/team/nginx:latest\t0.0.0.0:80->80/tcp",
      "exited\tabcdef0123456789aaaa\tjob\tExited (0) 3 minutes ago\tregistry.example.com/team/busybox:latest\t",
    ];
    for (let i = 0; i < 8; i += 1) {
      rows.push(
        `running\t${i}123456789abcdef0000\tsvc-${i}\tUp 4 hours\tregistry.example.com/team/app-${i}:latest\t0.0.0.0:${9000 + i}->${9000 + i}/tcp`,
      );
    }

    const result = await filterRtkOutput(["docker", "ps", "-a"], rows.join("\n"));

    expectRtkParity(result, {
      critical: [
        "[docker] 9 running:",
        "  0123456789ab web (nginx:latest) Up 2 hours [80]",
        "[docker] 1 stopped/exited:",
        "  abcdef012345 job (busybox:latest) Exited (0) 3 minutes ago",
      ],
      forbidden: [/registry\.example\.com/, /0123456789abcdef/],
    });
  });

  // RTK: cloud/container.rs::docker_images — header sums GB/MB sizes (GB→MB
  // ×1024, displayed as GB past 1024MB) and lists "  image [size]", truncating
  // past CAP_INVENTORY (50). The truncation makes the inventory beat the dump.
  test("docker images sums sizes into a header and lists each image", async () => {
    const rows = [
      "registry.example.com/team/nginx:latest\t512MB",
      "registry.example.com/team/node:20\t1.5GB",
      "registry.example.com/team/redis:7\t128MB",
    ];
    for (let i = 0; i < 60; i += 1) {
      rows.push(`registry.example.com/team/app-${i}:latest\t10MB`);
    }

    const result = await filterRtkOutput(["docker", "images"], rows.join("\n"));

    // 512 + 1536 + 128 + 60*10 = 2776MB -> 2.7GB
    expectRtkParity(result, {
      critical: [
        "[docker] 63 images (2.7GB)",
        "  registry.example.com/team/nginx:latest [512MB]",
        "  … +13 more",
      ],
      minTokenSavingsRatio: 0.1,
    });
  });

  // RTK: cloud/container.rs::format_compose_ps test_format_compose_ps_empty /
  // _whitespace_only — whitespace-only input collapses to a zero summary.
  test("compose ps reports zero services on whitespace-only input", async () => {
    const empty = await filterRtkOutput(
      ["docker", "compose", "ps"],
      `${" ".repeat(80)}\n${" ".repeat(90)}\n${" ".repeat(100)}`,
    );
    expect(empty.output.trim()).toBe("[compose] 0 services");
  });
});
