import { parentPort } from "node:worker_threads";
import bcrypt from "bcryptjs";

// Worker băm mật khẩu (AD-31 D6, docs/06-backend/auth-hardening/PLAN.md bước 5).
// bcryptjs là JS thuần: bản async chỉ chia nhỏ việc băm, mỗi khúc vẫn chặn luồng chính,
// nên 8 người đăng nhập cùng lúc làm mọi request khác chờ ~1 giây (bước 0). Ở đây dùng
// bản đồng bộ vì đã ở luồng riêng. Hash cũ dùng được nguyên (cùng thư viện, cùng định dạng).
//
// File chạy ở hai dạng như embedding-worker: `.ts` khi `tsx watch` và `.js` trong `dist/`.

export type PasswordHashRequest =
  | { id: number; op: "hash"; password: string; rounds: number }
  | { id: number; op: "compare"; password: string; hash: string };

export type PasswordHashResponse = { id: number; result: string | boolean } | { id: number; error: string };

const port = parentPort;
if (port) {
  port.on("message", (request: PasswordHashRequest) => {
    try {
      const result =
        request.op === "hash"
          ? bcrypt.hashSync(request.password, request.rounds)
          : bcrypt.compareSync(request.password, request.hash);
      port.postMessage({ id: request.id, result } satisfies PasswordHashResponse);
    } catch (error) {
      port.postMessage({
        id: request.id,
        error: error instanceof Error ? error.message : String(error),
      } satisfies PasswordHashResponse);
    }
  });
}
