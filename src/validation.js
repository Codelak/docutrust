const { z } = require("zod");

const createDocumentSchema = z.object({
  title: z.string().min(1).max(200),
  body: z.string().min(1).max(20000),
});

const createCommentSchema = z.object({
  body: z.string().min(1).max(2000),
});

module.exports = { createDocumentSchema, createCommentSchema };
