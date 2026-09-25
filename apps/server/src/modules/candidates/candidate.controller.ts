import type { NextFunction, Request, Response } from "express";
import type { ApiResponse, ImportFromCvResponse } from "@sip/shared-types";
import { CandidateService } from "./candidate.service";
import type { CandidateCvImportService } from "./candidate-cv-import.service";
import type { ImportFromCvInput } from "./candidates.dto";

export class CandidateController {
  private readonly candidateService: CandidateService;
  private readonly candidateCvImportService: CandidateCvImportService;

  constructor({
    candidateService,
    candidateCvImportService,
  }: {
    candidateService: CandidateService;
    candidateCvImportService: CandidateCvImportService;
  }) {
    this.candidateService = candidateService;
    this.candidateCvImportService = candidateCvImportService;
  }

  importFromCv = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const data = await this.candidateCvImportService.importFromCv(req.user!.id, req.body as ImportFromCvInput);
      const body: ApiResponse<ImportFromCvResponse> = { success: true, data };
      res.json(body);
    } catch (error) {
      next(error);
    }
  };

  me = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const profile = await this.candidateService.getProfile(req.user!.id);
      const body: ApiResponse = { success: true, data: profile };
      res.json(body);
    } catch (error) {
      next(error);
    }
  };

  getPublicProfile = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const profile = await this.candidateService.getPublicProfile(String(req.params.id));
      const body: ApiResponse = { success: true, data: profile };
      res.json(body);
    } catch (error) {
      next(error);
    }
  };

  updateMe = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const profile = await this.candidateService.updateProfile(req.user!.id, req.body);
      const body: ApiResponse = { success: true, data: profile };
      res.json(body);
    } catch (error) {
      next(error);
    }
  };

  uploadAvatar = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const profile = await this.candidateService.uploadAvatar(req.user!.id, req.file);
      const body: ApiResponse = { success: true, data: profile };
      res.json(body);
    } catch (error) {
      next(error);
    }
  };

  createEducation = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.candidateService.createEducation(req.user!.id, req.body);
      const body: ApiResponse = { success: true, data: result };
      res.status(201).json(body);
    } catch (error) {
      next(error);
    }
  };

  updateEducation = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.candidateService.updateEducation(req.user!.id, String(req.params.id), req.body);
      const body: ApiResponse = { success: true, data: result };
      res.json(body);
    } catch (error) {
      next(error);
    }
  };

  deleteEducation = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      await this.candidateService.deleteEducation(req.user!.id, String(req.params.id));
      res.json({ success: true, data: { deleted: true } });
    } catch (error) {
      next(error);
    }
  };

  listSkills = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const items = await this.candidateService.getCandidateSkills(req.user!.id);
      const body: ApiResponse = { success: true, data: items };
      res.json(body);
    } catch (error) {
      next(error);
    }
  };

  upsertSkill = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.candidateService.upsertSkill(req.user!.id, req.body.skillId, Number(req.body.yearsOfExperience ?? 0));
      const body: ApiResponse = { success: true, data: result };
      res.status(201).json(body);
    } catch (error) {
      next(error);
    }
  };

  removeSkill = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      await this.candidateService.removeSkill(req.user!.id, String(req.params.skillId));
      res.json({ success: true, data: { deleted: true } });
    } catch (error) {
      next(error);
    }
  };

  createWorkExperience = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.candidateService.createWorkExperience(req.user!.id, req.body);
      const body: ApiResponse = { success: true, data: result };
      res.status(201).json(body);
    } catch (error) {
      next(error);
    }
  };

  updateWorkExperience = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.candidateService.updateWorkExperience(req.user!.id, String(req.params.id), req.body);
      const body: ApiResponse = { success: true, data: result };
      res.json(body);
    } catch (error) {
      next(error);
    }
  };

  deleteWorkExperience = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      await this.candidateService.deleteWorkExperience(req.user!.id, String(req.params.id));
      res.json({ success: true, data: { deleted: true } });
    } catch (error) {
      next(error);
    }
  };

  createProject = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.candidateService.createProject(req.user!.id, req.body);
      const body: ApiResponse = { success: true, data: result };
      res.status(201).json(body);
    } catch (error) {
      next(error);
    }
  };

  updateProject = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.candidateService.updateProject(req.user!.id, String(req.params.id), req.body);
      const body: ApiResponse = { success: true, data: result };
      res.json(body);
    } catch (error) {
      next(error);
    }
  };

  deleteProject = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      await this.candidateService.deleteProject(req.user!.id, String(req.params.id));
      res.json({ success: true, data: { deleted: true } });
    } catch (error) {
      next(error);
    }
  };

  createCertificate = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.candidateService.createCertificate(req.user!.id, req.body);
      const body: ApiResponse = { success: true, data: result };
      res.status(201).json(body);
    } catch (error) {
      next(error);
    }
  };

  updateCertificate = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.candidateService.updateCertificate(req.user!.id, String(req.params.id), req.body);
      const body: ApiResponse = { success: true, data: result };
      res.json(body);
    } catch (error) {
      next(error);
    }
  };

  deleteCertificate = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      await this.candidateService.deleteCertificate(req.user!.id, String(req.params.id));
      res.json({ success: true, data: { deleted: true } });
    } catch (error) {
      next(error);
    }
  };

  createAward = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.candidateService.createAward(req.user!.id, req.body);
      const body: ApiResponse = { success: true, data: result };
      res.status(201).json(body);
    } catch (error) {
      next(error);
    }
  };

  updateAward = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.candidateService.updateAward(req.user!.id, String(req.params.id), req.body);
      const body: ApiResponse = { success: true, data: result };
      res.json(body);
    } catch (error) {
      next(error);
    }
  };

  deleteAward = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      await this.candidateService.deleteAward(req.user!.id, String(req.params.id));
      res.json({ success: true, data: { deleted: true } });
    } catch (error) {
      next(error);
    }
  };
}
