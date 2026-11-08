export type Lang = "en" | "ru" | "kk";
export type RiskLevel = "low" | "moderate" | "high" | "critical";
export type InputType = "message" | "url" | "investment" | "advertisement" | "call";

export type ScoreCategory = "phishing" | "social_engineering" | "financial_fraud" | "technical" | "contextual";
export type Severity = "low" | "medium" | "high" | "critical" | "info";

export interface Indicator {
  id: string;
  name: string;
  description: string;
  severity: Severity;
  weight: number;
  category: ScoreCategory | "mitigation" | "ai_context";
  group?: string | null;
  contribution: number;
  source: "heuristic" | "url" | "intel" | "ai";
  evidence?: string | null;
  evidence_type: "content" | "external" | "derived" | "ai";
  explanation?: string | null;
  recommendation?: string | null;
  verified: boolean;
}

export interface ScoreDetails {
  ruleset_version?: string;
  raw_score?: number;
  mitigation?: number;
  categories?: Record<ScoreCategory, { score: number; uncapped: number; cap: number; indicators: number; groups: number }>;
}

export interface CheckResult {
  name: string;
  status: "passed" | "flagged" | "unavailable" | "skipped" | "error";
  detail: string;
}

export interface AnalysisResult {
  id: number | null;
  input_type: InputType;
  risk_score: number;
  risk_level: RiskLevel;
  threat_type: string;
  summary: string;
  indicators: Indicator[];
  recommendations: string[];
  confidence: number;
  checks: CheckResult[];
  domains: string[];
  score_breakdown: Partial<Record<ScoreCategory, number>>;
  score_details: ScoreDetails;
  similar: { count: number; best_id: number; best_similarity: number; threat_type: string; best_risk_score: number } | null;
  call: CallAssessment | null;
  ai_assessment: { risk_score: number; risk_level: RiskLevel; threat_type: string; summary: string; confidence: number; note: string } | null;
  language: Lang;
  ai_used: boolean;
  is_demo: boolean;
  status: string;
  submitted_content: string | null;
  created_at: string | null;
}

export interface ScanSummary {
  id: number;
  submitted_content: string;
  input_type: InputType;
  risk_score: number;
  risk_level: RiskLevel;
  threat_type: string;
  confidence: number;
  status: string;
  is_demo: boolean;
  ai_used: boolean;
  created_at: string;
}

export interface DashboardStats {
  total_scans: number;
  threats_detected: number;
  critical_threats: number;
  average_risk: number;
  ai_scans: number;
  demo_scans: number;
  by_level: Record<RiskLevel, number>;
  by_threat_type: { type: string; label: string; count: number }[];
  by_input_type: Record<string, number>;
  category_points: Record<ScoreCategory, number>;
  activity: { date: string; scans: number; threats: number }[];
  recent: { id: number; input_type: InputType; risk_score: number; risk_level: RiskLevel; threat_type: string; content: string; created_at: string; is_demo: boolean }[];
  suspicious_domains: { domain: string; risk_score: number; scan_id: number; created_at: string }[];
}

export interface ThreatIntel {
  categories: { id: string; label: string; description: string; observed: number }[];
  reference_patterns: { id: string; category: string; severity: string; weight: number; name: string; description: string }[];
  top_indicators: { id: string; name: string; count: number }[];
  severity_distribution: Record<"low" | "medium" | "high" | "critical", number>;
  domain_indicators: { domain: string; max_risk: number; seen: number; last_seen: string; indicators: string[] }[];
  recent_findings: { id: number; threat_type: string; label: string; risk_score: number; summary: string; created_at: string; is_demo: boolean }[];
  disclaimer: string;
}

export interface Scenario {
  id: string;
  input_type: InputType;
  expected_level: RiskLevel;
  title: string;
  content: string;
  is_test_example: boolean;
}

export interface Health {
  status: string;
  ai_provider: { enabled: boolean; model: string | null };
  checks: { url_fetch: boolean; domain_age_rdap: boolean; google_safe_browsing: boolean; virustotal: boolean };
}

export type CallStage = "contact" | "pretext" | "pressure" | "extraction";

export interface CallAssessment {
  alert: boolean;
  reason: { id: string; name: string; evidence?: string | null } | null;
  stages: CallStage[];
  stage_count: number;
}

export interface CallScript {
  is_test_example: boolean;
  lines: { speaker: "caller" | "you"; text: string }[];
}
