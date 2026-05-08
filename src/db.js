import { PrismaClient } from "./generated/prisma/client.ts";
import { PrismaLibSql } from "@prisma/adapter-libsql";

export function createPrismaClient() {
  const adapter = new PrismaLibSql({ url: "file:data/data.db" });
  return new PrismaClient({ adapter });
}

export default createPrismaClient();
