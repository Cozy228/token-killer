import { describe, expect, test } from "vitest";

import { expectRtkParity, filterRtkOutput } from "../../helpers/rtkCommandHarness.js";

// Faithful parity tests for the AWS handler (src/handlers/cloud/aws.ts).
// Source of truth: rtk/src/cmds/cloud/aws_cmd.rs — the filter_* functions and their
// #[test]s. AWS CLI emits verbose JSON; RTK parses it and emits compact summaries.
// Inputs are deliberately verbose (full AWS-CLI-shaped JSON) so that compaction
// shrinks them well below the makeFilteredResult inflation gate.
describe("RTK aws behavior", () => {
  // RTK: aws_cmd.rs::filter_cfn_describe_stacks / test_filter_cfn_describe_stacks_*
  test("summarizes CloudFormation describe-stacks to name/status/date plus outputs", async () => {
    const result = await filterRtkOutput(
      ["aws", "cloudformation", "describe-stacks"],
      JSON.stringify({
        Stacks: [
          {
            StackId: "arn:aws:cloudformation:us-east-1:123456789012:stack/api-prod/abc-123",
            StackName: "api-prod",
            ChangeSetId: null,
            Description: "API production stack with a fairly long description field",
            Parameters: [{ ParameterKey: "Env", ParameterValue: "prod" }],
            CreationTime: "2024-01-15T10:30:00Z",
            LastUpdatedTime: "2024-02-20T14:00:00Z",
            RollbackConfiguration: {},
            StackStatus: "UPDATE_COMPLETE",
            DisableRollback: false,
            NotificationARNs: [],
            Capabilities: ["CAPABILITY_IAM"],
            Outputs: [
              { OutputKey: "ApiUrl", OutputValue: "https://api.example.com", Description: "url" },
              { OutputKey: "BucketName", OutputValue: "my-bucket" },
            ],
            Tags: [{ Key: "team", Value: "platform" }],
            EnableTerminationProtection: false,
            DriftInformation: { StackDriftStatus: "NOT_CHECKED" },
          },
        ],
        ResponseMetadata: { RequestId: "req-123", HTTPStatusCode: 200 },
      }),
    );

    // truncate_iso_date prefers LastUpdatedTime over CreationTime, first 10 chars.
    expectRtkParity(result, {
      critical: [
        "api-prod UPDATE_COMPLETE 2024-02-20",
        "  ApiUrl=https://api.example.com",
        "  BucketName=my-bucket",
      ],
      forbidden: [/ResponseMetadata/, /RequestId/, /DriftInformation/, /Capabilities/],
      minSavingsRatio: 0.6,
    });
  });

  // RTK: aws_cmd.rs::filter_cfn_describe_stacks — date falls back to "?" when neither
  // LastUpdatedTime nor CreationTime is present (truncate_iso_date("?") == "?").
  test("CloudFormation describe-stacks uses '?' when no timestamp is present", async () => {
    const result = await filterRtkOutput(
      ["aws", "cloudformation", "describe-stacks"],
      JSON.stringify({
        Stacks: [
          {
            StackName: "api-prod",
            StackStatus: "CREATE_COMPLETE",
            DriftInformation: { StackDriftStatus: "IN_SYNC" },
            RollbackConfiguration: {},
            NotificationARNs: [],
          },
          {
            StackName: "web-prod",
            StackStatus: "UPDATE_COMPLETE",
            DriftInformation: { StackDriftStatus: "IN_SYNC" },
            RollbackConfiguration: {},
            NotificationARNs: [],
          },
        ],
        ResponseMetadata: { RequestId: "req-456", HTTPStatusCode: 200 },
      }),
    );

    expectRtkParity(result, {
      critical: ["api-prod CREATE_COMPLETE ?", "web-prod UPDATE_COMPLETE ?"],
      forbidden: [/ResponseMetadata/, /RequestId/],
      exact: ["api-prod CREATE_COMPLETE ?", "web-prod UPDATE_COMPLETE ?"].join("\n"),
    });
  });

  // RTK: aws_cmd.rs::filter_ec2_instances / test_filter_ec2_instances
  test("summarizes EC2 describe-instances into one compact line per instance", async () => {
    const result = await filterRtkOutput(
      ["aws", "ec2", "describe-instances"],
      JSON.stringify({
        Reservations: [
          {
            ReservationId: "r-001",
            OwnerId: "123456789012",
            Groups: [],
            Instances: [
              {
                InstanceId: "i-abc123",
                ImageId: "ami-0abcdef1234567890",
                State: { Code: 16, Name: "running" },
                InstanceType: "t3.micro",
                PrivateIpAddress: "10.0.1.5",
                PublicIpAddress: "54.1.2.3",
                VpcId: "vpc-001",
                SubnetId: "subnet-001",
                KeyName: "my-key-pair",
                LaunchTime: "2024-01-15T10:30:00+00:00",
                BlockDeviceMappings: [{ DeviceName: "/dev/xvda" }],
                SecurityGroups: [{ GroupId: "sg-001", GroupName: "web" }],
                Tags: [{ Key: "Name", Value: "web-server" }],
              },
              {
                InstanceId: "i-def456",
                State: { Code: 80, Name: "stopped" },
                InstanceType: "t3.large",
                PrivateIpAddress: "10.0.1.6",
                VpcId: "vpc-001",
                SubnetId: "subnet-002",
                BlockDeviceMappings: [],
                SecurityGroups: [{ GroupId: "sg-002", GroupName: "worker" }],
                Tags: [{ Key: "Name", Value: "worker" }],
              },
            ],
          },
        ],
        ResponseMetadata: { RequestId: "req-ec2", HTTPStatusCode: 200 },
      }),
    );

    expectRtkParity(result, {
      critical: [
        "EC2: 2 instances",
        "i-abc123 running t3.micro 10.0.1.5 pub:54.1.2.3 vpc:vpc-001 subnet:subnet-001 sg:[sg-001] (web-server)",
        "i-def456 stopped t3.large 10.0.1.6",
        "sg:[sg-002]",
      ],
      // Missing PublicIpAddress renders as "pub:-".
      forbidden: [/ImageId/, /BlockDeviceMappings/, /ResponseMetadata/],
      minSavingsRatio: 0.6,
    });
    expect(result.output).toContain("i-def456 stopped t3.large 10.0.1.6 pub:- vpc:vpc-001");
  });

  // RTK: aws_cmd.rs::filter_lambda_list / test_filter_lambda_list — Environment is
  // intentionally NOT read, so secrets must never leak into the summary.
  test("Lambda list-functions strips secrets and keeps name/runtime/mem/timeout/state", async () => {
    const result = await filterRtkOutput(
      ["aws", "lambda", "list-functions"],
      // AWS CLI emits pretty-printed (indented) JSON; mirror that so token savings
      // (whitespace-delimited, like RTK count_tokens) is measured realistically.
      JSON.stringify(
        {
          Functions: [
            {
              FunctionName: "my-api",
              FunctionArn: "arn:aws:lambda:us-east-1:123:function:my-api",
              Runtime: "python3.12",
              Role: "arn:aws:iam::123:role/role-1",
              Handler: "index.handler",
              CodeSize: 5242880,
              Timeout: 30,
              MemorySize: 512,
              LastModified: "2024-01-15T10:30:00.000+0000",
              State: "Active",
              Environment: { Variables: { SECRET_KEY: "s3cr3t", DB_PASSWORD: "hunter2" } },
            },
            {
              FunctionName: "my-worker",
              FunctionArn: "arn:aws:lambda:us-east-1:123:function:my-worker",
              Runtime: "nodejs20.x",
              MemorySize: 256,
              Timeout: 60,
              State: "Active",
            },
          ],
          ResponseMetadata: { RequestId: "req-lambda", HTTPStatusCode: 200 },
        },
        null,
        2,
      ),
    );

    expectRtkParity(result, {
      critical: ["my-api python3.12 512MB 30s Active", "my-worker nodejs20.x 256MB 60s Active"],
      forbidden: [/SECRET_KEY/, /s3cr3t/, /DB_PASSWORD/, /hunter2/, /FunctionArn/],
      minTokenSavingsRatio: 0.6,
    });
  });

  // RTK: aws_cmd.rs::filter_sts_identity / test_filter_sts_identity
  test("STS get-caller-identity collapses to 'AWS: <account> <arn>'", async () => {
    const result = await filterRtkOutput(
      ["aws", "sts", "get-caller-identity"],
      JSON.stringify({
        UserId: "AIDAEXAMPLEUSERID1234567890ABCDEF",
        Account: "123456789012",
        Arn: "arn:aws:iam::123456789012:user/dev-user",
        ResponseMetadata: { RequestId: "req-sts-0123456789", HTTPStatusCode: 200 },
      }),
    );

    expectRtkParity(result, {
      critical: ["AWS: 123456789012 arn:aws:iam::123456789012:user/dev-user"],
      forbidden: [/UserId/, /ResponseMetadata/, /RequestId/],
      exact: "AWS: 123456789012 arn:aws:iam::123456789012:user/dev-user",
    });
  });

  // ADR 0001 decision 2: RTK's "… +N more items" cap is REMOVED. The JSON list
  // filters reshape every item and, within budget, emit the full compact listing
  // with NO overflow marker. A 20-instance EC2 listing is reshaped to one compact
  // line per instance, every instance retained, and crucially NO fake "… +N more".
  test("compresses an EC2 listing in full with no fake '… +N more' marker", async () => {
    const instances = [];
    for (let i = 0; i < 20; i += 1) {
      instances.push({
        InstanceId: `i-${String(i).padStart(6, "0")}`,
        ImageId: "ami-0abcdef1234567890",
        State: { Code: 16, Name: "running" },
        InstanceType: "t3.micro",
        PrivateIpAddress: `10.0.1.${i}`,
        PublicIpAddress: `54.1.2.${i}`,
        VpcId: "vpc-001",
        SubnetId: "subnet-001",
        BlockDeviceMappings: [{ DeviceName: "/dev/xvda" }],
        SecurityGroups: [{ GroupId: "sg-001", GroupName: "web" }],
        Tags: [{ Key: "Name", Value: `node-${i}` }],
      });
    }
    const result = await filterRtkOutput(
      ["aws", "ec2", "describe-instances"],
      JSON.stringify(
        {
          Reservations: [{ ReservationId: "r-001", Instances: instances }],
          ResponseMetadata: { RequestId: "req-ec2", HTTPStatusCode: 200 },
        },
        null,
        2,
      ),
    );

    // 20 instances == cap: every instance is shown (first and last), and there is
    // NO fake overflow marker. tg never emits a "… +N more" omission marker.
    expect(result.output).toContain("EC2: 20 instances");
    expect(result.output).toContain("i-000000 running t3.micro");
    expect(result.output).toContain("i-000019 running t3.micro");
    expect(result.output).not.toMatch(/(?:\.{3}|…)\s*\+\d+\s+more/);

    expectRtkParity(result, {
      critical: ["EC2: 20 instances", "i-000019 running t3.micro"],
      forbidden: [
        /ImageId/,
        /BlockDeviceMappings/,
        /ResponseMetadata/,
        /(?:\.{3}|…)\s*\+\d+\s+more/,
      ],
      minSavingsRatio: 0.3,
    });
  });

  // ADR 0001 decisions 2/5/7: over budget, EC2 ladders instead of reverting to raw.
  // The step-1 lossless digest keeps EVERY instance's id/state/name and drops the
  // network decoration (privateIp/pub/vpc/subnet/sg), declaring `kind === "digest"`.
  // No "… +N more" — all 300 instances survive, compressed.
  test("EC2 over budget ships the lossless id/state/name digest, not raw", async () => {
    // 150 instances: the full per-line listing exceeds the 2000-token budget (so the
    // ladder engages) but the id/state/name digest stays under it (so digest ships,
    // not the count-only step-2 replacement).
    const instances = Array.from({ length: 150 }, (_, i) => ({
      InstanceId: `i-${String(i).padStart(8, "0")}`,
      State: { Code: 16, Name: "running" },
      InstanceType: "t3.micro",
      PrivateIpAddress: `10.0.${Math.floor(i / 256)}.${i % 256}`,
      PublicIpAddress: `54.1.2.${i % 256}`,
      VpcId: "vpc-0123456789",
      SubnetId: "subnet-0123456789",
      SecurityGroups: [{ GroupId: "sg-0123456789", GroupName: "web" }],
      Tags: [{ Key: "Name", Value: `service-node-${i}` }],
    }));

    const result = await filterRtkOutput(
      ["aws", "ec2", "describe-instances"],
      JSON.stringify({ Reservations: [{ ReservationId: "r-001", Instances: instances }] }),
    );

    expect(result.qualityStatus).toBe("passed");
    expect(result.omission?.kind).toBe("digest");
    expect(result.output).toContain("EC2: 150 instances");
    expect(result.output).toContain("  i-00000000 running (service-node-0)");
    expect(result.output).toContain("  i-00000149 running (service-node-149)");
    expectRtkParity(result, {
      critical: ["EC2: 150 instances"],
      // No fake-complete marker; network decoration dropped in the digest.
      forbidden: [/… \+\d+ more/, /pub:/, /vpc:/, /sg:\[/],
      minSavingsRatio: 0.5,
    });
  });
});
