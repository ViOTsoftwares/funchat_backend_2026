import express from "express";
import * as CommunityCrt from "../controllers/community.js";

const router = express.Router();

router.get("/community", CommunityCrt.GetPublicCommunities);

export default router;
