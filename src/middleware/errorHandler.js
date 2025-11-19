export default (err, req, res, next) => {
  console.error("ERROR:", err);
  res.status(500).json({ error: "Server error" });
};
