import type { Request, Response } from "express";
import type { MessagingService } from "./messaging.service";
import type { CreateConversationRequest } from "@sip/shared-types";

export class MessagingController {
  private readonly messagingService: MessagingService;
  
  constructor({ messagingService }: { messagingService: MessagingService }) {
    this.messagingService = messagingService;
  }

  listConversations = async (req: Request, res: Response) => {
    const { id: userId, role } = req.user!;
    const conversations = await this.messagingService.getConversations(userId, role);
    res.json({ success: true, data: conversations });
  };

  unreadSummary = async (req: Request, res: Response) => {
    const { id: userId, role } = req.user!;
    const summary = await this.messagingService.getUnreadSummary(userId, role);
    res.json({ success: true, data: summary });
  };

  createConversation = async (req: Request, res: Response) => {
    const { id: userId, role } = req.user!;
    const { jobPostId, candidateId } = req.body as CreateConversationRequest & { candidateId?: string };
    const conversation = await this.messagingService.createConversation(userId, role, jobPostId, candidateId);
    res.json({ success: true, data: conversation });
  };

  listMessages = async (req: Request, res: Response) => {
    const { id: userId, role } = req.user!;
    const id = req.params.id as string;
    const cursor = req.query.cursor as string | undefined;
    const messages = await this.messagingService.getMessages(userId, role, id, cursor);
    res.json({ success: true, data: messages });
  };

  markAsRead = async (req: Request, res: Response) => {
    const { id: userId, role } = req.user!;
    const id = req.params.id as string;
    await this.messagingService.markAsRead(userId, role, id);
    res.json({ success: true, data: { success: true } });
  };

  deleteConversation = async (req: Request, res: Response) => {
    const { id: userId, role } = req.user!;
    const id = req.params.id as string;
    const result = await this.messagingService.deleteConversation(userId, role, id);
    res.json({ success: true, data: result });
  };
}
