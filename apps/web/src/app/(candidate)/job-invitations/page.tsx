import type { Metadata } from "next";
import { OutreachInvitationInbox } from "@/components/candidate/OutreachInvitationInbox";

export const metadata: Metadata = { title: "Lời mời ứng tuyển — InternHub" };

export default function JobInvitationsPage() {
  return <OutreachInvitationInbox />;
}
