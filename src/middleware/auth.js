import jwt from "jsonwebtoken";

export const authMiddleware = (req, res, next) => {
  try {
    const header = req.headers.authorization;

    if (!header)
      return res.status(401).json({ error: "Missing auth header" });

    const token = header.split(" ")[1]; // "Bearer <token>"

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    req.user = decoded;
    next();

  } catch (err) {
    res.status(401).json({ error: "Invalid token" });
  }
};
