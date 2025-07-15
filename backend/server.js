const { app, upload, uploadTimesheet, listTimesheets, approveTimesheet, deleteTimesheet } = require("./app");
const {confirmLogin, resetPassword} = require("./database.cjs");

app.post("/upload", upload.single("timesheet"), uploadTimesheet);
app.get("/timesheets", listTimesheets);
app.post("/approve", approveTimesheet);
app.delete("/delete", deleteTimesheet);
app.post('/login', confirmLogin);
app.post('/resetpassword', resetPassword);

app.listen(3000, '0.0.0.0', () => {
  console.log(`✅ Server running at http://0.0.0.0:3000`);
});
