// Port thuần TypeScript — băm / so mật khẩu (AD-31 D6). Implementation chạy bcrypt
// trong worker_threads (infrastructure/worker-password-hasher.ts) để không chặn luồng chính.
export interface PasswordHasher {
  /** Băm mật khẩu với số vòng `rounds` (bcrypt cost). */
  hash(password: string, rounds: number): Promise<string>;

  /** So mật khẩu với hash đã lưu. Lỗi hạ tầng (worker chết, quá giờ) thì ném, không trả false. */
  compare(password: string, hash: string): Promise<boolean>;
}
