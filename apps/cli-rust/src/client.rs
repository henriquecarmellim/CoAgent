use crate::types::*;
use reqwest::Client;
use std::process::Command;
use std::time::Duration;
use tokio::time::sleep;

pub struct CoAgentClient {
    base_url: String,
    http: Client,
}

impl CoAgentClient {
    pub fn new(base_url: Option<String>) -> Self {
        let base_url = base_url.unwrap_or_else(|| "http://127.0.0.1:3333".to_string());
        let http = Client::builder()
            .timeout(Duration::from_secs(300))
            .build()
            .unwrap_or_default();

        Self { base_url, http }
    }

    /// Garante que o backend TypeScript está respondendo. Caso contrário, inicia em segundo plano.
    pub async fn ensure_backend_running(&self) -> Result<(), String> {
        if self.health_check().await.is_ok() {
            return Ok(());
        }

        // Tenta iniciar o backend TypeScript automaticamente
        let _ = Command::new("node")
            .arg("apps/dashboard/dist/server.js")
            .spawn();

        for _ in 0..15 {
            sleep(Duration::from_millis(300)).await;
            if self.health_check().await.is_ok() {
                return Ok(());
            }
        }

        Err(format!(
            "Não foi possível conectar ao backend CoAgent em {}. Inicie manualmente com: 'npm run start:dashboard'",
            self.base_url
        ))
    }

    pub async fn health_check(&self) -> Result<bool, reqwest::Error> {
        let res = self
            .http
            .get(format!("{}/api/status", self.base_url))
            .timeout(Duration::from_secs(2))
            .send()
            .await?;
        Ok(res.status().is_success())
    }

    pub async fn get_status(&self) -> Result<SystemStatus, String> {
        self.http
            .get(format!("{}/api/status", self.base_url))
            .send()
            .await
            .map_err(|e| e.to_string())?
            .json::<SystemStatus>()
            .await
            .map_err(|e| e.to_string())
    }

    pub async fn list_agents(&self) -> Result<Vec<AgentStatusInfo>, String> {
        self.http
            .get(format!("{}/api/agents", self.base_url))
            .send()
            .await
            .map_err(|e| e.to_string())?
            .json::<Vec<AgentStatusInfo>>()
            .await
            .map_err(|e| e.to_string())
    }

    pub async fn list_tasks(&self, limit: usize, status: Option<&str>) -> Result<Vec<TaskInfo>, String> {
        let mut url = format!("{}/api/tasks?limit={}", self.base_url, limit);
        if let Some(s) = status {
            url.push_str(&format!("&status={}", s));
        }

        self.http
            .get(&url)
            .send()
            .await
            .map_err(|e| e.to_string())?
            .json::<Vec<TaskInfo>>()
            .await
            .map_err(|e| e.to_string())
    }

    pub async fn get_task(&self, id: &str) -> Result<TaskInfo, String> {
        self.http
            .get(format!("{}/api/tasks/{}", self.base_url, id))
            .send()
            .await
            .map_err(|e| e.to_string())?
            .json::<TaskInfo>()
            .await
            .map_err(|e| e.to_string())
    }

    pub async fn create_task(&self, body: CreateTaskBody) -> Result<TaskInfo, String> {
        self.http
            .post(format!("{}/api/tasks", self.base_url))
            .json(&body)
            .send()
            .await
            .map_err(|e| e.to_string())?
            .json::<TaskInfo>()
            .await
            .map_err(|e| e.to_string())
    }

    pub async fn approve_task(&self, id: &str) -> Result<serde_json::Value, String> {
        self.http
            .post(format!("{}/api/tasks/{}/approve", self.base_url, id))
            .send()
            .await
            .map_err(|e| e.to_string())?
            .json::<serde_json::Value>()
            .await
            .map_err(|e| e.to_string())
    }

    pub async fn reject_task(&self, id: &str) -> Result<serde_json::Value, String> {
        self.http
            .post(format!("{}/api/tasks/{}/reject", self.base_url, id))
            .send()
            .await
            .map_err(|e| e.to_string())?
            .json::<serde_json::Value>()
            .await
            .map_err(|e| e.to_string())
    }

    pub async fn cancel_task(&self, id: &str) -> Result<serde_json::Value, String> {
        self.http
            .post(format!("{}/api/tasks/{}/cancel", self.base_url, id))
            .send()
            .await
            .map_err(|e| e.to_string())?
            .json::<serde_json::Value>()
            .await
            .map_err(|e| e.to_string())
    }

    pub async fn advise(&self, query: &str, context: Option<&str>) -> Result<AdviseResponse, String> {
        let body = serde_json::json!({
            "query": query,
            "context": context
        });

        self.http
            .post(format!("{}/api/advise", self.base_url))
            .json(&body)
            .send()
            .await
            .map_err(|e| e.to_string())?
            .json::<AdviseResponse>()
            .await
            .map_err(|e| e.to_string())
    }

    pub async fn review(&self, diff: &str) -> Result<ReviewResponse, String> {
        let body = serde_json::json!({ "diff": diff });

        self.http
            .post(format!("{}/api/review", self.base_url))
            .json(&body)
            .send()
            .await
            .map_err(|e| e.to_string())?
            .json::<ReviewResponse>()
            .await
            .map_err(|e| e.to_string())
    }

    pub async fn run_test(&self, agent_id: Option<&str>) -> Result<TestResponse, String> {
        let body = serde_json::json!({ "agentId": agent_id });

        self.http
            .post(format!("{}/api/test", self.base_url))
            .json(&body)
            .send()
            .await
            .map_err(|e| e.to_string())?
            .json::<TestResponse>()
            .await
            .map_err(|e| e.to_string())
    }

    pub async fn execute_objective(&self, goal: &str, exhaust: bool) -> Result<ObjectiveResponse, String> {
        let body = serde_json::json!({
            "goal": goal,
            "exhaustUntilComplete": exhaust
        });

        self.http
            .post(format!("{}/api/objective", self.base_url))
            .json(&body)
            .send()
            .await
            .map_err(|e| e.to_string())?
            .json::<ObjectiveResponse>()
            .await
            .map_err(|e| e.to_string())
    }
}
