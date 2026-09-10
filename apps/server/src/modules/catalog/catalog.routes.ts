import { Router } from "express";
import type { AwilixContainer } from "awilix";
import type { PrismaClient } from "@prisma/client";

export function catalogRouter(container: AwilixContainer): Router {
  const router = Router();
  const prisma = container.resolve<PrismaClient>("prisma");

  router.get("/catalog/majors", async (_req, res) => {
    const data = await prisma.major.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } });
    res.json({ success: true, data });
  });
  router.get("/catalog/universities", async (_req, res) => {
    const data = await prisma.university.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } });
    res.json({ success: true, data });
  });
  router.get("/catalog/skills", async (_req, res) => {
    const data = await prisma.skill.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } });
    res.json({ success: true, data });
  });
  router.get("/catalog/cities", async (_req, res) => {
    const data = await prisma.city.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } });
    res.json({ success: true, data });
  });

  return router;
}