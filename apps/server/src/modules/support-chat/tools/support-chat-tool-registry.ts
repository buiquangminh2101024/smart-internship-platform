import type { Logger } from "../../../shared/logger";
import type { SupportChatToolbox } from "../../../shared/ports/SupportChatResponder";
import type { ApplicationsService } from "../../applications/applications.service";
import type { CandidateInsightsRepository } from "../../candidate-insights/candidate-insights.repository";
import type { InterviewsService } from "../../interviews/interviews.service";
import type { CandidateMatchProfileLoader } from "../../job-matching/candidate-match-profile.loader";
import type { FaqViewer } from "../faq-knowledge-base";
import { candidateSupportChatTools } from "./candidate-support-chat-tools";
import type { SupportChatTool } from "./support-chat-tool";

/** Bộ tool của một lượt hỏi, kèm danh sách tool đã chạy. */
export interface SupportChatToolSession {
  toolbox: SupportChatToolbox;
  /** Tên tool đã chạy (theo thứ tự) — có tool chạy ⇒ không cache, không gắn nguồn FAQ. Ghi log được, không chứa dữ liệu. */
  calls: string[];
}

/**
 * Tool theo vai trò (GĐ2). Khách và Admin (được xử lý như khách) không có tool. Employer có
 * tool từ đợt F.
 */
export class SupportChatToolRegistry {
  private readonly toolsByViewer: Partial<Record<FaqViewer, ReadonlyMap<string, SupportChatTool>>>;
  private readonly logger: Logger;

  constructor({
    applicationsService,
    interviewsService,
    candidateInsightsRepository,
    candidateMatchProfileLoader,
    logger,
  }: {
    applicationsService: ApplicationsService;
    interviewsService: InterviewsService;
    candidateInsightsRepository: CandidateInsightsRepository;
    candidateMatchProfileLoader: CandidateMatchProfileLoader;
    logger: Logger;
  }) {
    const byName = (tools: SupportChatTool[]) => new Map(tools.map((tool) => [tool.declaration.name, tool]));
    this.toolsByViewer = {
      candidate: byName(
        candidateSupportChatTools({
          applicationsService,
          interviewsService,
          candidateInsightsRepository,
          candidateMatchProfileLoader,
        }),
      ),
    };
    this.logger = logger;
  }

  /**
   * `userId` phải lấy từ `req.user` (JWT) — mọi tool chạy với đúng giá trị này, model không đổi
   * được. null khi vai trò không có tool.
   */
  openSession(viewer: FaqViewer, userId: string, required: boolean): SupportChatToolSession | null {
    const tools = this.toolsByViewer[viewer];
    if (!tools) return null;
    const calls: string[] = [];
    const toolbox: SupportChatToolbox = {
      declarations: [...tools.values()].map((tool) => tool.declaration),
      required,
      execute: async (name, args) => {
        const tool = tools.get(name);
        // Tên do model gửi — tên lạ không ghi nguyên văn vào log.
        calls.push(tool ? name : "(unknown)");
        if (!tool) return { error: `Không có chức năng tra cứu "${name.slice(0, 64)}".` };
        try {
          return await tool.execute(userId, args);
        } catch (error) {
          this.logger.error("Support chat tool failed", {
            tool: name,
            error: error instanceof Error ? error.message : String(error),
          });
          return { error: "Không tra được dữ liệu lúc này." };
        }
      },
    };
    return { toolbox, calls };
  }
}
