const { PrismaClient } = require("./generated/prisma/client");
const { PrismaLibSql } = require("@prisma/adapter-libsql");

function createPrismaClient() {
  const adapter = new PrismaLibSql({ url: "file:data/data.db" });
  return new PrismaClient({ adapter });
}

module.exports = { createPrismaClient };
