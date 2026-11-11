use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConcurrencyStatus {
    pub active: usize,
    pub max: usize,
    pub queue_size: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProjectMemoryStatus {
    pub loaded: bool,
    #[serde(rename = "rulesCount")]
    pub rules_count: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentCapability {
    #[serde(rename = "maxConcurrency")]
    pub max_concurrency: usize,
    #[serde(rename = "supportedTaskTypes")]
    pub supported_task_types: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentStatusInfo {
    pub id: String,
    pub name: String,
    pub provider: String,
    pub status: String,
    #[serde(rename = "activeTasksCount")]
    pub active_tasks_count: usize,
    #[serde(rename = "totalTasksCompleted")]
    pub total_tasks_completed: usize,
    #[serde(rename = "totalTasksFailed")]
    pub total_tasks_failed: usize,
    pub capabilities: Option<AgentCapability>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SystemStatus {
    pub concurrency: ConcurrencyStatus,
    pub agents: Vec<AgentStatusInfo>,
    #[serde(rename = "activeTasks")]
    pub active_tasks: Vec<serde_json::Value>,
    #[serde(rename = "queuedTasks")]
    pub queued_tasks: Vec<serde_json::Value>,
    #[serde(rename = "projectMemory")]
    pub project_memory: ProjectMemoryStatus,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TaskInfo {
    pub id: String,
    pub title: String,
    pub description: Option<String>,
    #[serde(rename = "type")]
    pub task_type: String,
    pub status: String,
    pub priority: String,
    #[serde(rename = "assignedAgent")]
    pub assigned_agent: Option<String>,
    #[serde(rename = "targetModel")]
    pub target_model: Option<String>,
    #[serde(rename = "dependsOn", default)]
    pub depends_on: Vec<String>,
    #[serde(rename = "createdAt")]
    pub created_at: String,
    #[serde(rename = "startedAt")]
    pub started_at: Option<String>,
    #[serde(rename = "completedAt")]
    pub completed_at: Option<String>,
    pub result: Option<serde_json::Value>,
    pub error: Option<serde_json::Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateTaskBody {
    pub title: String,
    pub description: Option<String>,
    #[serde(rename = "type")]
    pub task_type: Option<String>,
    pub priority: Option<String>,
    #[serde(rename = "agentId")]
    pub agent_id: Option<String>,
    #[serde(rename = "dangerouslySkipPermissions")]
    pub dangerously_skip_permissions: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AdviseResponse {
    pub advice: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReviewIssue {
    pub severity: String,
    pub message: String,
    pub line: Option<usize>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReviewResponse {
    pub approved: bool,
    pub summary: String,
    #[serde(rename = "issuesFound", default)]
    pub issues_found: Vec<ReviewIssue>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TestAgentResult {
    #[serde(rename = "agentId")]
    pub agent_id: String,
    pub name: String,
    pub success: bool,
    pub output: Option<String>,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TestResponse {
    pub results: Vec<TestAgentResult>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ObjectiveResponse {
    pub success: bool,
    pub goal: String,
    pub summary: String,
    #[serde(rename = "tasksCompleted")]
    pub tasks_completed: usize,
    #[serde(rename = "tasksFailed")]
    pub tasks_failed: usize,
}
