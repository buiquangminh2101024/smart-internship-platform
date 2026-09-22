// Ranh giới tới model embedding (Job Matcher GĐ2). Job Matcher chỉ cần "văn bản
// → vector"; nó không biết model chạy local hay qua API.
export interface EmbeddingProvider {
  /** Định danh model — đi vào contentHash để đổi model thì vector cũ tự hết hiệu lực. */
  readonly modelId: string;
  /** Vector đã chuẩn hoá độ dài, hoặc null khi model không dùng được (không throw). */
  embed(text: string): Promise<number[] | null>;
}
