import { describe, expect, test } from "vitest";

import {
  parseCheckstyleOutput,
  parseJacocoOutput,
  parsePmdOutput,
  parseSpotbugsOutput,
} from "../../../src/handlers/java/staticAnalysis.js";
import { expectRtkParity, filterRtkOutput } from "../../helpers/rtkCommandHarness.js";

describe("JVM ecosystem parser behavior", () => {
  test("static-analysis parsers do not fabricate matches", () => {
    const raw = ["BUILD SUCCESSFUL in 1s", "2 actionable tasks: 2 executed"].join("\n");

    expect(parseCheckstyleOutput(raw)).toEqual([]);
    expect(parsePmdOutput(raw)).toEqual([]);
    expect(parseSpotbugsOutput(raw)).toEqual([]);
    expect(parseJacocoOutput(raw)).toEqual([]);
  });

  test("Maven dependency resolution keeps coordinate, repository, and root cause", async () => {
    const result = await filterRtkOutput(
      ["mvn", "test"],
      [
        "[INFO] --- maven-resources-plugin:3.3.1:resources (default-resources) @ order-service ---",
        "[ERROR] Failed to execute goal on project order-service: Could not resolve dependencies for project com.example:order-service:jar:1.0.0",
        "[ERROR] Could not find com.example:missing-lib:jar:1.2.3 in central (https://repo.maven.apache.org/maven2)",
        "[ERROR] Failed to read artifact descriptor for com.example:missing-lib:jar:1.2.3",
        "[INFO] BUILD FAILURE",
      ].join("\n"),
      1,
    );

    expectRtkParity(result, {
      critical: [
        "Could not resolve dependencies",
        "com.example:missing-lib:jar:1.2.3",
        "central (https://repo.maven.apache.org/maven2)",
        "BUILD FAILURE",
      ],
      forbidden: [/maven-resources-plugin/],
    });
  });

  test("Gradle dependency resolution keeps configuration, dependency, repository, and root cause", async () => {
    const result = await filterRtkOutput(
      ["./gradlew", "build"],
      [
        "> Configure project :app",
        "> Task :app:compileJava FAILED",
        "",
        "FAILURE: Build failed with an exception.",
        "",
        "* What went wrong:",
        "Execution failed for task ':app:compileJava'.",
        "> Could not resolve all files for configuration ':app:compileClasspath'.",
        "   > Could not find com.example:missing-lib:1.2.3.",
        "     Required by:",
        "         project :app",
        "     Searched in the following locations:",
        "       - https://repo.maven.apache.org/maven2/com/example/missing-lib/1.2.3/missing-lib-1.2.3.pom",
        "",
        "* Try:",
        "> Run with --stacktrace option to get the stack trace.",
        "BUILD FAILED in 2s",
      ].join("\n"),
      1,
    );

    expectRtkParity(result, {
      critical: [
        "Could not resolve all files for configuration ':app:compileClasspath'",
        "Could not find com.example:missing-lib:1.2.3",
        "Required by:",
        "project :app",
        "https://repo.maven.apache.org/maven2",
        "BUILD FAILED in 2s",
      ],
      forbidden: [/Run with --stacktrace/, /> Configure project/],
    });
  });

  test("Spring Boot failure keeps banner, condition, exception chain, and user frame", async () => {
    const result = await filterRtkOutput(
      ["mvn", "test"],
      [
        "[ERROR] com.example.OrderApplicationTests.contextLoads -- Time elapsed: 0.300 s <<< ERROR!",
        "[ERROR] java.lang.IllegalStateException: Failed to load ApplicationContext for [WebMergedContextConfiguration@123 testClass = com.example.OrderApplicationTests]",
        "[ERROR]",
        "[ERROR] APPLICATION FAILED TO START",
        "[ERROR]",
        "[ERROR] Description:",
        "[ERROR] Web server failed to start. Port 8080 was already in use.",
        "[ERROR]",
        "[ERROR] Action:",
        "[ERROR] Identify and stop the process that's listening on port 8080.",
        "[ERROR] Caused by: org.springframework.beans.factory.BeanCreationException: Error creating bean with name 'orderController'",
        "[ERROR]     at com.example.OrderApplication.start(OrderApplication.java:19)",
        "[ERROR]     at org.springframework.boot.SpringApplication.run(SpringApplication.java:338)",
        "[ERROR] Tests run: 1, Failures: 0, Errors: 1, Skipped: 0",
        "[INFO] BUILD FAILURE",
      ].join("\n"),
      1,
    );

    expectRtkParity(result, {
      critical: [
        "Failed to load ApplicationContext",
        "APPLICATION FAILED TO START",
        "Port 8080 was already in use",
        "BeanCreationException",
        "OrderApplication.java:19",
        "BUILD FAILURE",
      ],
      forbidden: [/SpringApplication\.java:338/],
    });
  });

  test("Maven Checkstyle plugin keeps file coordinate, rule, count, and report path", async () => {
    const result = await filterRtkOutput(
      ["mvn", "checkstyle:check"],
      [
        "[INFO] --- maven-checkstyle-plugin:3.3.1:check (default-cli) @ order-service ---",
        "[ERROR] src/main/java/com/example/OrderController.java:45:13: Missing a Javadoc comment. [JavadocMethod]",
        "[ERROR] You have 1 Checkstyle violation.",
        "[ERROR] Checkstyle report: file:///tmp/order-service/target/checkstyle-result.xml",
        "[ERROR] Failed to execute goal org.apache.maven.plugins:maven-checkstyle-plugin:3.3.1:check (default-cli) on project order-service: You have 1 Checkstyle violation.",
        "[INFO] BUILD FAILURE",
      ].join("\n"),
      1,
    );

    expectRtkParity(result, {
      critical: [
        "OrderController.java:45:13",
        "JavadocMethod",
        "1 Checkstyle violation",
        "file:///tmp/order-service/target/checkstyle-result.xml",
        "BUILD FAILURE",
      ],
      forbidden: [/default-cli/],
    });
  });

  test("Gradle PMD task keeps file coordinate, rule priority, count, and report path", async () => {
    const result = await filterRtkOutput(
      ["./gradlew", "pmdMain"],
      [
        "> Task :app:pmdMain FAILED",
        "PMD rule violations were found. See the report at: file:///tmp/app/build/reports/pmd/main.html",
        "src/main/java/com/example/OrderService.java:12: AvoidDuplicateLiterals Priority:3 category:Best Practices",
        "1 PMD violation",
        "BUILD FAILED in 3s",
      ].join("\n"),
      1,
    );

    expectRtkParity(result, {
      critical: [
        "PMD rule violations",
        "OrderService.java:12",
        "AvoidDuplicateLiterals",
        "Priority:3",
        "file:///tmp/app/build/reports/pmd/main.html",
        "BUILD FAILED in 3s",
      ],
    });
  });

  test("Gradle SpotBugs task keeps bug type, rank, location, count, and report path", async () => {
    const result = await filterRtkOutput(
      ["./gradlew", "spotbugsMain"],
      [
        "> Task :app:spotbugsMain FAILED",
        "SpotBugs found 1 bug. See the report at: file:///tmp/app/build/reports/spotbugs/main.html",
        "Bug type NP_NULL_ON_SOME_PATH (category CORRECTNESS, rank 14)",
        "Class: com.example.OrderService",
        "Method: submit(Order)",
        "Source line: OrderService.java:77",
        "BUILD FAILED in 4s",
      ].join("\n"),
      1,
    );

    expectRtkParity(result, {
      critical: [
        "SpotBugs found 1 bug",
        "NP_NULL_ON_SOME_PATH",
        "CORRECTNESS",
        "rank 14",
        "OrderService.java:77",
        "file:///tmp/app/build/reports/spotbugs/main.html",
        "BUILD FAILED in 4s",
      ],
    });
  });

  test("Gradle JaCoCo verification keeps counter, actual value, threshold, class, and report path", async () => {
    const result = await filterRtkOutput(
      ["./gradlew", "jacocoTestCoverageVerification"],
      [
        "> Task :app:jacocoTestCoverageVerification FAILED",
        "JaCoCo coverage rule violated for class com.example.OrderService",
        "Rule violated for class com.example.OrderService: LINE covered ratio is 0.50, but expected minimum is 0.80",
        "JaCoCo report: file:///tmp/app/build/reports/jacoco/test/html/index.html",
        "BUILD FAILED in 2s",
      ].join("\n"),
      1,
    );

    expectRtkParity(result, {
      critical: [
        "JaCoCo coverage rule violated",
        "com.example.OrderService",
        "LINE covered ratio is 0.50",
        "expected minimum is 0.80",
        "file:///tmp/app/build/reports/jacoco/test/html/index.html",
        "BUILD FAILED in 2s",
      ],
    });
  });
});
