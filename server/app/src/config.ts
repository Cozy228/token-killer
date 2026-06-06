// DB connection config. Host/port/name come from Lambda env vars (set by
// Terraform from the RDS outputs); the username/password come from the
// RDS-managed master secret in Secrets Manager, fetched once per cold start.
import {
  SecretsManagerClient,
  GetSecretValueCommand,
} from "@aws-sdk/client-secrets-manager";

export type DbConfig = {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
};

let cached: DbConfig | null = null;

export async function getDbConfig(): Promise<DbConfig> {
  if (cached) return cached;

  const host = requireEnv("DB_HOST");
  const secretArn = requireEnv("DB_SECRET_ARN");
  const database = process.env.DB_NAME ?? "telemetry";
  const port = Number(process.env.DB_PORT ?? "5432");

  const client = new SecretsManagerClient({});
  const res = await client.send(
    new GetSecretValueCommand({ SecretId: secretArn }),
  );
  // RDS-managed master secret shape: { "username": ..., "password": ... }
  const secret = JSON.parse(res.SecretString ?? "{}") as {
    username?: string;
    password?: string;
  };
  if (!secret.username || !secret.password) {
    throw new Error("master secret missing username/password");
  }

  cached = {
    host,
    port,
    database,
    user: secret.username,
    password: secret.password,
  };
  return cached;
}

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} env var is required`);
  return v;
}
