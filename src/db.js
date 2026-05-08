const path = require("path");
const { PrismaClient } = require("@prisma/client");
const { PrismaLibSql } = require("@prisma/adapter-libsql");

const DB_PATH = path.resolve(__dirname, "../data/data.db");

function createPrismaClient() {
  const adapter = new PrismaLibSql({ url: `file:${DB_PATH}` });
  return new PrismaClient({ adapter });
}

module.exports = { createPrismaClient };
