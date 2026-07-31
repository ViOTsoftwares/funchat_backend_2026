export const HandleError = (res, error, defaultMessage = "Something went wrong") => {
  console.error(error);
  res.status(500).json({
    ok: false,
    message: error.message || defaultMessage,
  });
};
