"use client";

import { useEffect, useRef } from "react";

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (config: { client_id: string; callback: (response: { credential: string }) => void }) => void;
          renderButton: (parent: HTMLElement, options: Record<string, unknown>) => void;
        };
      };
    };
  }
}

export interface GoogleAuthButtonProps {
  onIdToken: (idToken: string) => void;
  disabled?: boolean;
}

// Google Identity Services — chỉ Candidate/Employer (Admin không dùng Google).
// Ẩn hoàn toàn nếu chưa cấu hình NEXT_PUBLIC_GOOGLE_CLIENT_ID (dev có thể bỏ trống).
export function GoogleAuthButton({ onIdToken, disabled }: GoogleAuthButtonProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const onIdTokenRef = useRef(onIdToken);
  const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;

  useEffect(() => {
    onIdTokenRef.current = onIdToken;
  }, [onIdToken]);

  useEffect(() => {
    if (!clientId || disabled) return;

    function render() {
      if (!window.google || !containerRef.current) return;
      window.google.accounts.id.initialize({
        client_id: clientId as string,
        callback: (response) => onIdTokenRef.current(response.credential),
      });
      containerRef.current.innerHTML = "";
      window.google.accounts.id.renderButton(containerRef.current, {
        theme: "outline",
        size: "large",
        width: 320,
        text: "continue_with",
        locale: "vi",
      });
    }

    if (window.google) {
      render();
      return;
    }

    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.onload = render;
    document.head.appendChild(script);
  }, [clientId, disabled]);

  if (!clientId) return null;

  return <div ref={containerRef} className={disabled ? "pointer-events-none opacity-50" : ""} />;
}
