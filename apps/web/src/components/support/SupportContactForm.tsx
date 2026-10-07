"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import type { SupportCategory } from "@sip/shared-types";
import { ApiError } from "@/lib/api-client";
import { useSubmitSupportContact } from "@/hooks/useSupportContact";
import { formatNumber } from "@/lib/dashboard-format";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Icon } from "@/components/ui/Icon";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Textarea } from "@/components/ui/Textarea";
import { NoteBox } from "@/components/interviews/NoteBox";

// Khớp `supportContactSchema` ở server (nội dung 20–2000 ký tự sau khi trim).
const MESSAGE_MIN = 20;
const MESSAGE_MAX = 2000;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const EMAIL_ID = "support-email";
const CATEGORY_ID = "support-category";
const MESSAGE_ID = "support-message";

const CATEGORY_OPTIONS: { value: SupportCategory; label: string }[] = [
  { value: "ACCOUNT_SUSPENDED", label: "Tài khoản bị khoá" },
  { value: "OTHER", label: "Vấn đề khác" },
];

const CATEGORY_HINT: Record<SupportCategory, string> = {
  ACCOUNT_SUSPENDED: "Quản trị viên xem lại lý do khoá tài khoản của email trên rồi trả lời bạn.",
  OTHER: "Câu hỏi về tài khoản, tin tuyển dụng hoặc cách dùng InternHub.",
};

const MESSAGE_PLACEHOLDER: Record<SupportCategory, string> = {
  ACCOUNT_SUSPENDED: "Ví dụ: tài khoản của mình bị khoá hôm qua, mình nghĩ có nhầm lẫn vì…",
  OTHER: "Mô tả vấn đề bạn gặp và bước bạn đã thử",
};

interface FieldErrors {
  email?: string | undefined;
  message?: string | undefined;
}

function validate(email: string, message: string): FieldErrors {
  const errors: FieldErrors = {};
  if (!email) errors.email = "Nhập email để quản trị viên trả lời bạn.";
  else if (!EMAIL_PATTERN.test(email)) errors.email = "Email chưa đúng định dạng, ví dụ ten@gmail.com.";
  if (message.length < MESSAGE_MIN) errors.message = `Nội dung cần ít nhất ${MESSAGE_MIN} ký tự.`;
  return errors;
}

function submitErrorMessage(err: unknown): string {
  // 429: server đã trả câu tiếng Việt ("Bạn đã gửi quá nhiều yêu cầu…").
  if (err instanceof ApiError && err.status === 429) return err.message;
  if (err instanceof ApiError && err.status === 400) return "Thông tin chưa hợp lệ. Kiểm tra lại email và nội dung.";
  return "Không gửi được yêu cầu. Kiểm tra kết nối rồi thử lại.";
}

/**
 * Form trang hỗ trợ bản A (AD-17). Gửi xong thì thay bằng khung xác nhận —
 * khung này như nhau dù email có tài khoản hay không (H4).
 */
export function SupportContactForm({
  initialEmail,
  initialCategory,
}: {
  initialEmail: string;
  initialCategory: SupportCategory;
}) {
  const submit = useSubmitSupportContact();
  const [email, setEmail] = useState(initialEmail);
  const [category, setCategory] = useState<SupportCategory>(initialCategory);
  const [message, setMessage] = useState("");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const busy = submit.isPending;
  const messageLength = message.trim().length;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setServerError(null);
    const trimmedEmail = email.trim();
    const trimmedMessage = message.trim();
    const nextErrors = validate(trimmedEmail, trimmedMessage);
    setErrors(nextErrors);
    if (nextErrors.email || nextErrors.message) {
      document.getElementById(nextErrors.email ? EMAIL_ID : MESSAGE_ID)?.focus();
      return;
    }
    try {
      await submit.mutateAsync({ email: trimmedEmail, category, message: trimmedMessage });
      setSentTo(trimmedEmail);
    } catch (err) {
      setServerError(submitErrorMessage(err));
    }
  }

  function startOver() {
    setMessage("");
    setErrors({});
    setServerError(null);
    setSentTo(null);
    submit.reset();
  }

  if (sentTo) return <SentPanel email={sentTo} onStartOver={startOver} />;

  return (
    <Card className="max-sm:p-4">
      <form noValidate onSubmit={(event) => void handleSubmit(event)} className="flex flex-col gap-5">
        {serverError ? (
          <NoteBox tone="danger" icon="circle-alert" role="alert">
            {serverError}
          </NoteBox>
        ) : null}

        <Input
          id={EMAIL_ID}
          type="email"
          label="Email"
          required
          autoComplete="email"
          maxLength={254}
          value={email}
          disabled={busy}
          error={errors.email}
          hint="Quản trị viên trả lời qua email này. Nếu bạn có tài khoản, dùng email đăng nhập."
          onChange={(event) => {
            setEmail(event.target.value);
            if (errors.email) setErrors((prev) => ({ ...prev, email: undefined }));
          }}
        />

        <Select
          id={CATEGORY_ID}
          label="Loại vấn đề"
          required
          value={category}
          disabled={busy}
          options={CATEGORY_OPTIONS}
          hint={CATEGORY_HINT[category]}
          onChange={(event) => setCategory(event.target.value as SupportCategory)}
        />

        <div className="grid gap-1.5">
          <div className="flex justify-between gap-2">
            <label htmlFor={MESSAGE_ID} className="text-sm font-medium text-text-strong">
              Nội dung<span className="text-red-600"> *</span>
            </label>
            <span
              className={`font-num text-[13px] tabular-nums ${messageLength < MESSAGE_MIN ? "text-text-muted" : "text-success-700"}`}
              aria-hidden
            >
              {formatNumber(messageLength)}/{formatNumber(MESSAGE_MAX)}
            </span>
          </div>
          <Textarea
            id={MESSAGE_ID}
            rows={6}
            maxLength={MESSAGE_MAX}
            value={message}
            disabled={busy}
            aria-invalid={errors.message !== undefined}
            aria-describedby={`${MESSAGE_ID}-msg`}
            className="aria-invalid:border-red-400"
            placeholder={MESSAGE_PLACEHOLDER[category]}
            onChange={(event) => {
              setMessage(event.target.value);
              if (errors.message && event.target.value.trim().length >= MESSAGE_MIN) {
                setErrors((prev) => ({ ...prev, message: undefined }));
              }
            }}
          />
          <span id={`${MESSAGE_ID}-msg`} className={`text-sm ${errors.message ? "text-red-600" : "text-text-muted"}`}>
            {errors.message ?? `Từ ${MESSAGE_MIN} đến ${formatNumber(MESSAGE_MAX)} ký tự.`}
          </span>
        </div>

        <div className="flex flex-col-reverse items-stretch gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-[13px] text-text-muted">Bạn không cần đăng nhập để gửi yêu cầu.</p>
          <Button type="submit" icon="send" loading={busy}>
            {busy ? "Đang gửi" : "Gửi yêu cầu"}
          </Button>
        </div>
      </form>
    </Card>
  );
}

function SentPanel({ email, onStartOver }: { email: string; onStartOver: () => void }) {
  const headingRef = useRef<HTMLHeadingElement>(null);

  // Form biến mất sau khi gửi: chuyển focus tới tiêu đề để trình đọc màn hình đọc kết quả.
  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  return (
    <Card className="flex flex-col items-start gap-4 max-sm:p-4">
      <span className="grid size-11 place-items-center rounded-full bg-success-100 text-success-700">
        <Icon name="mail-check" size={22} />
      </span>
      <div className="grid gap-1.5">
        <h2 ref={headingRef} tabIndex={-1} className="text-lg font-semibold text-text-strong outline-none">
          Đã gửi yêu cầu
        </h2>
        <p className="text-[15px] text-text-body">
          Quản trị viên sẽ phản hồi qua email <span className="font-semibold text-text-strong [overflow-wrap:anywhere]">{email}</span>.
          Hãy kiểm tra cả thư mục spam.
        </p>
      </div>
      <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
        <Button as="a" href="/" variant="secondary">
          Về trang chủ
        </Button>
        <Button variant="ghost" onClick={onStartOver}>
          Gửi yêu cầu khác
        </Button>
      </div>
    </Card>
  );
}
