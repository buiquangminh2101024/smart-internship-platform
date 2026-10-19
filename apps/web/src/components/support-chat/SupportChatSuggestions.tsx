"use client";

import type { SupportChatSuggestion } from "@sip/shared-types";

export interface SupportChatSuggestionsProps {
  suggestions: SupportChatSuggestion[];
  disabled: boolean;
  onPick: (suggestion: SupportChatSuggestion) => void;
}

/** Lời chào + chip câu gợi ý, chỉ hiện khi hội thoại trống. Bấm chip ⇒ gửi kèm `faqId`. */
export function SupportChatSuggestions({ suggestions, disabled, onPick }: SupportChatSuggestionsProps) {
  return (
    <div className="space-y-3">
      <p className="text-[15px] text-text-body">Xin chào. Bạn cần hỗ trợ gì về InternHub?</p>
      {suggestions.length > 0 ? (
        <ul className="flex flex-col items-start gap-2" aria-label="Câu hỏi gợi ý">
          {suggestions.map((suggestion) => (
            <li key={suggestion.faqId} className="max-w-full">
              <button
                type="button"
                disabled={disabled}
                onClick={() => onPick(suggestion)}
                className="cursor-pointer rounded-2xl border border-border-default bg-white px-3 py-1.5 text-left text-sm text-text-body transition-colors hover:border-brand-200 hover:bg-brand-50 hover:text-text-strong disabled:cursor-not-allowed disabled:opacity-50"
              >
                {suggestion.question}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
