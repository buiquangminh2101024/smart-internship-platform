import { z } from "zod";
import type { SupportChatToolDeclaration } from "../../../shared/ports/SupportChatResponder";

/**
 * Một tool chỉ đọc của chatbot (GĐ2, D12). `userId` do server truyền (lấy từ JWT), không nằm
 * trong tham số model gửi; tham số là `strictObject` nên trường lạ (vd. `userId`, `candidateId`)
 * bị từ chối chứ không lặng lẽ bỏ qua.
 */
export interface SupportChatTool {
  declaration: SupportChatToolDeclaration;
  /** `rawArgs` là thứ model gửi, chưa kiểm. Tham số sai ⇒ `{ error }` để model tự sửa hoặc báo lại. */
  execute(userId: string, rawArgs: unknown): Promise<Record<string, unknown>>;
}

/** Khai báo tool một lần bằng zod: vừa kiểm tham số, vừa sinh JSON Schema gửi cho model. */
export function defineSupportChatTool<Args extends z.ZodObject>(definition: {
  name: string;
  description: string;
  args: Args;
  run: (userId: string, args: z.output<Args>) => Promise<Record<string, unknown>>;
}): SupportChatTool {
  const { $schema: _schemaVersion, ...parameters } = z.toJSONSchema(definition.args, { io: "input" });
  const hasParameters = Object.keys(definition.args.shape).length > 0;
  return {
    declaration: {
      name: definition.name,
      description: definition.description,
      ...(hasParameters ? { parameters } : {}),
    },
    async execute(userId, rawArgs) {
      const parsed = definition.args.safeParse(rawArgs ?? {});
      if (!parsed.success) return { error: `Tham số không hợp lệ: ${z.prettifyError(parsed.error)}` };
      return definition.run(userId, parsed.data);
    },
  };
}
