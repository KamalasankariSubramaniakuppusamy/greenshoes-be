export const adminDashboard = (req, res) => {
  res.json({
    success: true,
    message: "Admin dashboard access granted."
  });
};

// TEMP placeholders — real logic comes in Phase 3
export const addProduct = (req, res) => {
  res.json({ message: "addProduct controller placeholder" });
};

export const updateProduct = (req, res) => {
  res.json({ message: "updateProduct controller placeholder" });
};

export const deleteProduct = (req, res) => {
  res.json({ message: "deleteProduct controller placeholder" });
};
