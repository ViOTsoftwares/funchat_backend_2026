import express from "express";

import * as AdminCrt from "../controllers/admin.js";
import { adminAuthMiddleware } from "../middlewares/auth.middleware.js";
import { adminPermission } from "../middlewares/permission.middleware.js";
import * as SettingCrt from "../controllers/settings.js";
import * as BlogCrt from "../controllers/blog.js";
import * as CMSCrt from "../controllers/cms.js";
import * as TestimonialCrt from "../controllers/testimonial.js";
import * as ModuleCrt from "../controllers/module.js";
import * as EmailTemplateCrt from "../controllers/emailTemplate.js";

import { uploadLogo } from "../lib/multer.js";

const router = express.Router();

router.post("/login", AdminCrt.adminLogin);
router.patch("/change-password", adminAuthMiddleware, AdminCrt.changePassword);
router.post("/logout", AdminCrt.adminLogout);
router.get("/me", adminAuthMiddleware, AdminCrt.getMe);

// admins
router
  .route("/admin")
  .get(adminAuthMiddleware, adminPermission("Admin", "view"), AdminCrt.AdminList)
  .post(adminAuthMiddleware, adminPermission("Admin", "add"), AdminCrt.CreateAdmin)
  .put(adminAuthMiddleware, adminPermission("Admin", "edit"), AdminCrt.UpdateAdmin)
  .delete(adminAuthMiddleware, adminPermission("Admin", "delete"), AdminCrt.DeleteAdmin);
router.get("/admin/:id", adminAuthMiddleware, adminPermission("Admin", "view"), AdminCrt.OneAdmin);

// settings
router
  .route("/settings")
  .get(adminAuthMiddleware, SettingCrt.GetSetting)
  .post(adminAuthMiddleware, uploadLogo.single("logo"), SettingCrt.UpdateSetting);

// blog
router
  .route("/blog")
  .get(adminAuthMiddleware, BlogCrt.BlogList)
  .post(adminAuthMiddleware, BlogCrt.CreateBlog)
  .put(adminAuthMiddleware, BlogCrt.UpdateBlog)
  .delete(adminAuthMiddleware, BlogCrt.DeleteBlog);
router.get("/blog/:id", adminAuthMiddleware, BlogCrt.OneBlog);

// dashboard
router.route("/dashboard").get(adminAuthMiddleware, AdminCrt.getAllDataCounts);

// CMS
router
  .route("/cms")
  .get(adminAuthMiddleware, CMSCrt.CMSList)
  .post(adminAuthMiddleware, CMSCrt.CreateCMS)
  .put(adminAuthMiddleware, CMSCrt.UpdateCMS)
  .delete(adminAuthMiddleware, CMSCrt.DeleteCMS);
router.get("/cms/:id", adminAuthMiddleware, CMSCrt.OneCMS);

// Email Templates
router
  .route("/email-template")
  .get(adminAuthMiddleware, EmailTemplateCrt.EmailTemplateList)
  .post(adminAuthMiddleware, EmailTemplateCrt.CreateEmailTemplate)
  .put(adminAuthMiddleware, EmailTemplateCrt.UpdateEmailTemplate)
  .delete(adminAuthMiddleware, EmailTemplateCrt.DeleteEmailTemplate);
router.get("/email-template/:id", adminAuthMiddleware, EmailTemplateCrt.OneEmailTemplate);

// Modules
router
  .route("/module")
  .get(adminAuthMiddleware, ModuleCrt.ModuleList)
  .post(adminAuthMiddleware, ModuleCrt.CreateModule)
  .put(adminAuthMiddleware, ModuleCrt.UpdateModule)
  .delete(adminAuthMiddleware, ModuleCrt.DeleteModule);
router.get("/module/:id", adminAuthMiddleware, ModuleCrt.OneModule);

// Testimonial
router
  .route("/testimonial")
  .get(adminAuthMiddleware, TestimonialCrt.TestimonialList)
  .post(adminAuthMiddleware, uploadLogo.single("logo"), TestimonialCrt.CreateTestimonial)
  .put(adminAuthMiddleware, uploadLogo.single("logo"), TestimonialCrt.UpdateTestimonial)
  .delete(adminAuthMiddleware, TestimonialCrt.DeleteTestimonial);
router.get("/testimonial/:id", adminAuthMiddleware, TestimonialCrt.OneTestimonial);

export default router;
