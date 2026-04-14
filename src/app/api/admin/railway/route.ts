import { NextResponse } from 'next/server';

const RAILWAY_API = 'https://backboard.railway.com/graphql/v2';

function getHeaders() {
  const token = process.env.RAILWAY_API_TOKEN;
  if (!token) throw new Error('RAILWAY_API_TOKEN が未設定です');
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  };
}

async function railwayQuery<T>(query: string, variables: Record<string, unknown>): Promise<T> {
  const res = await fetch(RAILWAY_API, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify({ query, variables }),
    cache: 'no-store',
  });
  const json = (await res.json()) as { data?: T; errors?: { message: string }[] };
  if (json.errors?.length) throw new Error(json.errors[0].message);
  if (!json.data) throw new Error('Railway API からデータを取得できませんでした');
  return json.data;
}

// ─── 最新デプロイメント取得 ───────────────────────────────────────────────

interface DeploymentNode {
  id: string;
  status: string;
  createdAt: string;
  url: string | null;
}

interface DeploymentsData {
  deployments: {
    edges: { node: DeploymentNode }[];
  };
}

async function getLatestDeployment(): Promise<DeploymentNode | null> {
  const projectId = process.env.RAILWAY_PROJECT_ID;
  const serviceId = process.env.RAILWAY_SERVICE_ID;
  if (!projectId || !serviceId) return null;

  const data = await railwayQuery<DeploymentsData>(
    `query latestDeployment($input: DeploymentListInput!) {
      deployments(input: $input, first: 3) {
        edges {
          node {
            id
            status
            createdAt
            url
          }
        }
      }
    }`,
    { input: { projectId, serviceId } }
  );

  return data.deployments.edges[0]?.node ?? null;
}

// ─── デプロイメントログ取得 ───────────────────────────────────────────────

interface LogEntry {
  timestamp: string;
  message: string;
  severity: string;
}

interface LogsData {
  deploymentLogs: LogEntry[];
}

async function getDeploymentLogs(deploymentId: string, limit = 80): Promise<LogEntry[]> {
  const data = await railwayQuery<LogsData>(
    `query deploymentLogs($deploymentId: String!, $limit: Int) {
      deploymentLogs(deploymentId: $deploymentId, limit: $limit) {
        timestamp
        message
        severity
      }
    }`,
    { deploymentId, limit }
  );
  return data.deploymentLogs;
}

// ─── エンドポイント ──────────────────────────────────────────────────────

export async function GET() {
  try {
    const deployment = await getLatestDeployment();
    if (!deployment) {
      return NextResponse.json({
        error: 'RAILWAY_PROJECT_ID または RAILWAY_SERVICE_ID が未設定です',
      });
    }

    const logs = await getDeploymentLogs(deployment.id);

    return NextResponse.json({
      deployment: {
        id: deployment.id,
        status: deployment.status,
        createdAt: deployment.createdAt,
        url: deployment.url,
      },
      logs: logs.map((l) => ({
        timestamp: l.timestamp,
        message: l.message,
        severity: l.severity,
      })),
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : '不明なエラー' },
      { status: 500 }
    );
  }
}
