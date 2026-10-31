import type { AuditActivityItem } from "@sip/shared-types";

/*
 * Sơ đồ trạng thái cho tab "Hành trình đối tượng" (plan FE, `lib/audit-journey.ts`).
 * Mỗi hành động chuyển đối tượng từ trạng thái `from` (thường gặp) sang `to`.
 * Phát lại các bước theo thời gian: trạng thái hiện tại là đích của bước trước,
 * nên cạnh vẽ ra luôn khớp đúng chuỗi đã xảy ra, kể cả khi đi đường lạ.
 */

export interface JourneyNode {
  key: string;
  label: string;
  /** Cột và hàng trên lưới của sơ đồ. */
  col: number;
  row: number;
}

export interface JourneyTransition {
  from: string;
  to: string;
}

export interface JourneyMachine {
  nodes: JourneyNode[];
  /** Cạnh luôn vẽ (nhạt) để thấy cả đường chưa đi. */
  edges: JourneyTransition[];
  transitions: Record<string, JourneyTransition>;
}

const JOB_POST: JourneyMachine = {
  // Từ vựng trạng thái tin của sip-ui.
  nodes: [
    { key: "DRAFT", label: "Nháp", col: 0, row: 0 },
    { key: "PENDING", label: "Chờ duyệt", col: 1, row: 0 },
    { key: "PUBLISHED", label: "Đang hiển thị", col: 2, row: 0 },
    { key: "TAKEN_DOWN", label: "Đã hạ", col: 3, row: 0 },
  ],
  edges: [
    { from: "DRAFT", to: "PENDING" },
    { from: "PENDING", to: "PUBLISHED" },
    { from: "PUBLISHED", to: "TAKEN_DOWN" },
    { from: "PENDING", to: "DRAFT" },
    { from: "DRAFT", to: "PUBLISHED" },
  ],
  transitions: {
    JOB_POST_SUBMITTED: { from: "DRAFT", to: "PENDING" },
    JOB_POST_AUTO_PUBLISHED: { from: "DRAFT", to: "PUBLISHED" },
    JOB_POST_APPROVED: { from: "PENDING", to: "PUBLISHED" },
    // Bị từ chối thì tin quay về Nháp (job-posts `reject`).
    JOB_POST_REJECTED: { from: "PENDING", to: "DRAFT" },
    JOB_POST_RETRACTED: { from: "PUBLISHED", to: "TAKEN_DOWN" },
  },
};

const COMPANY: JourneyMachine = {
  nodes: [
    { key: "NONE", label: "Chưa gửi", col: 0, row: 0 },
    { key: "PENDING", label: "Chờ xác minh", col: 1, row: 0 },
    { key: "VERIFIED", label: "Đã xác minh", col: 2, row: 0 },
    { key: "REJECTED", label: "Bị từ chối", col: 2, row: 1 },
  ],
  edges: [
    { from: "NONE", to: "PENDING" },
    { from: "PENDING", to: "VERIFIED" },
    { from: "PENDING", to: "REJECTED" },
    { from: "REJECTED", to: "PENDING" },
  ],
  transitions: {
    COMPANY_SUBMITTED: { from: "NONE", to: "PENDING" },
    COMPANY_AUTO_VERIFIED: { from: "NONE", to: "VERIFIED" },
    COMPANY_VERIFIED: { from: "PENDING", to: "VERIFIED" },
    COMPANY_REJECTED: { from: "PENDING", to: "REJECTED" },
  },
};

const USER: JourneyMachine = {
  nodes: [
    { key: "INACTIVE", label: "Chưa kích hoạt", col: 0, row: 0 },
    { key: "ACTIVE", label: "Hoạt động", col: 1, row: 0 },
    { key: "SUSPENDED", label: "Bị khoá", col: 2, row: 0 },
  ],
  edges: [
    { from: "INACTIVE", to: "ACTIVE" },
    { from: "ACTIVE", to: "SUSPENDED" },
    { from: "SUSPENDED", to: "ACTIVE" },
  ],
  transitions: {
    USER_ACTIVATED: { from: "INACTIVE", to: "ACTIVE" },
    USER_SUSPENDED: { from: "ACTIVE", to: "SUSPENDED" },
    USER_REACTIVATED: { from: "SUSPENDED", to: "ACTIVE" },
  },
};

const CATALOG: JourneyMachine = {
  nodes: [
    { key: "PENDING", label: "Chờ duyệt", col: 0, row: 1 },
    { key: "APPROVED", label: "Đã duyệt", col: 1, row: 0 },
    { key: "MERGED", label: "Đã gộp", col: 1, row: 1 },
    { key: "REJECTED", label: "Bị từ chối", col: 1, row: 2 },
  ],
  edges: [
    { from: "PENDING", to: "APPROVED" },
    { from: "PENDING", to: "MERGED" },
    { from: "PENDING", to: "REJECTED" },
  ],
  transitions: {
    CATALOG_ENTRY_APPROVED: { from: "PENDING", to: "APPROVED" },
    CATALOG_ENTRY_MERGED: { from: "PENDING", to: "MERGED" },
    CATALOG_ENTRY_REJECTED: { from: "PENDING", to: "REJECTED" },
  },
};

/** `Subscription` (và loại lạ) không có sơ đồ, chỉ có danh sách bước. */
export function journeyMachine(entityType: string): JourneyMachine | null {
  switch (entityType) {
    case "JobPost":
      return JOB_POST;
    case "Company":
      return COMPANY;
    case "User":
      return USER;
    case "Skill":
    case "University":
    case "Major":
      return CATALOG;
    default:
      return null;
  }
}

export interface TraversedEdge extends JourneyTransition {
  count: number;
  /** id các bước đi qua cạnh này, theo thời gian. */
  itemIds: string[];
}

export interface ReplayResult {
  edges: TraversedEdge[];
  /** Trạng thái sau bước cuối; chưa có bước chuyển nào thì null. */
  current: string | null;
}

/** Phát lại các bước (cũ trước) trên sơ đồ, đếm số lần đi qua từng cạnh. */
export function replayJourney(machine: JourneyMachine, items: AuditActivityItem[]): ReplayResult {
  const edges = new Map<string, TraversedEdge>();
  let state: string | null = null;
  for (const item of items) {
    const transition = machine.transitions[item.action];
    if (!transition) continue;
    const from = state ?? transition.from;
    const key = `${from}>${transition.to}`;
    const edge = edges.get(key) ?? { from, to: transition.to, count: 0, itemIds: [] };
    edge.count += 1;
    edge.itemIds.push(item.id);
    edges.set(key, edge);
    state = transition.to;
  }
  return { edges: [...edges.values()], current: state };
}
