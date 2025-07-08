const { z } = require('zod');

const querySchema = z.object({
  json: z.any(),
  query: z.string().min(3)
});

const validateQueryRequest = (req, res, next) => {
  const result = querySchema.safeParse(req.body);
  if (!result.success) {
    return res.status(400).json({
      status: 'fail',
      error: result.error.errors.map(err => err.message)
    });
  }
  next();
};

module.exports = validateQueryRequest;
