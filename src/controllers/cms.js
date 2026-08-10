import { CMSModel } from "../models/index.js";
import { Pagination } from "../lib/pagination.js";
import { ColumnFilter } from "../lib/columnFilter.js";

export const CMSList = async (req, res) => {
  try {
    let { page, limit, filter } = req.query;
    const baseFilter = ColumnFilter(filter);
    const sort = { createdAt: -1 };
    const { skip } = Pagination({ page, limit });

    const list = await CMSModel.find(baseFilter).limit(limit).skip(skip).sort(sort);
    const count = await CMSModel.countDocuments(baseFilter);

    return res.status(200).json({ success: true, message: "Get all CMS", result: { list, count } });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ success: false, message: "Something went wrong" });
  }
};

export const OneCMS = async (req, res) => {
  try {
    const { id } = req.params;
    const result = await CMSModel.findById(id);
    if (!result) return res.status(404).json({ success: false, message: "Not found" });
    return res.status(200).json({ success: true, message: "Get CMS", result });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ success: false, message: "Something went wrong" });
  }
};

export const CreateCMS = async (req, res) => {
  try {
    const { identifier, title, content, status } = req.body;
    await CMSModel.create({ identifier, title, content, status: status || "active" });
    return res.status(200).json({ success: true, message: "Created successfully" });
  } catch (error) {
    console.error(error);
    if (error?.code === 11000) {
      return res.status(400).json({ success: false, message: "Identifier already exists", errors: { identifier: "Identifier already exists" } });
    }
    return res.status(500).json({ success: false, message: "Something went wrong" });
  }
};

export const UpdateCMS = async (req, res) => {
  try {
    const { id, identifier, title, content, status } = req.body;
    const existing = await CMSModel.findById(id);
    if (!existing) return res.status(404).json({ success: false, message: "Not found" });

    const updateData = {};
    if (identifier !== undefined) updateData.identifier = identifier;
    if (title !== undefined) updateData.title = title;
    if (content !== undefined) updateData.content = content;
    if (status !== undefined) updateData.status = status;

    await CMSModel.updateOne({ _id: id }, updateData);
    return res.status(200).json({ success: true, message: "Updated successfully" });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ success: false, message: "Something went wrong" });
  }
};

export const DeleteCMS = async (req, res) => {
  try {
    const { id } = req.body;
    await CMSModel.deleteOne({ _id: id });
    return res.status(200).json({ success: true, message: "Deleted successfully" });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ success: false, message: "Something went wrong" });
  }
};

// ─── Public API Endpoints ──────────────────────────────────────────────────

export const GetPublicCMSList = async (req, res) => {
  try {
    const pages = await CMSModel.find({ status: "active" })
      .select("identifier title updatedAt")
      .sort({ createdAt: 1 });
    return res.status(200).json({ success: true, result: pages });
  } catch (error) {
    console.error("Error fetching public CMS list:", error);
    return res.status(500).json({ success: false, message: "Failed to fetch CMS pages" });
  }
};

export const GetPublicCMSByIdentifier = async (req, res) => {
  try {
    const { identifier } = req.params;
    const page = await CMSModel.findOne({
      identifier: identifier.toLowerCase().trim(),
      status: "active",
    });
    if (!page) {
      return res.status(404).json({ success: false, message: "Page not found" });
    }
    return res.status(200).json({ success: true, result: page });
  } catch (error) {
    console.error("Error fetching public CMS page:", error);
    return res.status(500).json({ success: false, message: "Failed to fetch page" });
  }
};

// ─── Seed Standard Default CMS Pages ─────────────────────────────────────────

export const seedDefaultCMS = async () => {
  try {
    const count = await CMSModel.countDocuments();
    if (count > 0) return;

    const defaultPages = [
      {
        identifier: "privacy-policy",
        title: "Privacy Policy",
        status: "active",
        content: `
<h2>Privacy Policy for FunChat Connect</h2>
<p><em>Last Updated: August 2026</em></p>
<p>Welcome to FunChat. We are committed to protecting your privacy and providing a safe, anonymous, and secure environment for online communication.</p>

<h3>1. Information We Do NOT Collect</h3>
<ul>
  <li>We do not require account registration, passwords, or personal identity verification.</li>
  <li>We do not store your real-time private messages or peer-to-peer video streams once a chat session terminates.</li>
  <li>We do not sell personal data to third-party data brokers.</li>
</ul>

<h3>2. Technical & Session Data</h3>
<p>To facilitate peer-to-peer matchmaking via WebRTC and Socket.IO, temporary connection metadata (such as ephemeral socket identifiers and session timestamps) is utilized in-memory. This data is purged upon session termination.</p>

<h3>3. Data Security</h3>
<p>All web traffic and peer-to-peer video handshakes utilize modern TLS/SSL encryption and standard WebRTC DTLS-SRTP security protocols to prevent interception.</p>

<h3>4. Contact Us</h3>
<p>For questions or privacy inquiries, please reach out through our community support channels or administrative contact page.</p>
`,
      },
      {
        identifier: "terms-of-service",
        title: "Terms of Service",
        status: "active",
        content: `
<h2>Terms of Service</h2>
<p><em>Effective Date: August 2026</em></p>
<p>By accessing or using FunChat, you agree to be bound by these Terms of Service. If you disagree with any part of these terms, you must discontinue platform usage immediately.</p>

<h3>1. User Eligibility</h3>
<p>You must be at least 18 years old (or the legal age of majority in your jurisdiction) to use FunChat. By using this service, you represent and warrant that you meet this requirement.</p>

<h3>2. Prohibited Conduct</h3>
<ul>
  <li>Harassment, threats, hate speech, or abuse targeted at any individual or group.</li>
  <li>Sharing explicit, non-consensual, or unlawful media.</li>
  <li>Attempting to circumvent platform moderation, automated filters, or user safety mechanisms.</li>
  <li>Transmitting spam, automated bots, phishing links, or malicious code.</li>
</ul>

<h3>3. Account Termination & Bans</h3>
<p>FunChat reserves the right to immediately disconnect, IP-ban, or permanently restrict any user found violating platform rules.</p>
`,
      },
      {
        identifier: "community-guidelines",
        title: "Community Guidelines",
        status: "active",
        content: `
<h2>FunChat Community Guidelines</h2>
<p>Our mission is to foster respectful, engaging, and genuine connections across the globe. These guidelines apply to all text chats, video interactions, and community groups.</p>

<h3>Core Principles</h3>
<ul>
  <li><strong>Be Respectful:</strong> Treat everyone with dignity. Disagreements are normal, but personal attacks and abusive behavior will not be tolerated.</li>
  <li><strong>Protect Privacy:</strong> Never share sensitive personal data such as home addresses, banking details, or phone numbers in open chats.</li>
  <li><strong>Keep It Safe:</strong> Report inappropriate behavior using the in-chat reporting tools immediately so our moderation team can take action.</li>
</ul>
`,
      },
      {
        identifier: "safety-center",
        title: "Safety & Security Center",
        status: "active",
        content: `
<h2>Safety & Security Center</h2>
<p>Your safety is our top priority. Learn how our automated safety filters, peer-to-peer encryption, and community moderation tools protect you during every session.</p>

<h3>How We Keep You Safe</h3>
<ul>
  <li><strong>Anonymous Matching:</strong> You are paired without exposing personal credentials.</li>
  <li><strong>Instant Skip & Disconnect:</strong> Leave any uncomfortable conversation instantly with one click.</li>
  <li><strong>One-Click Reporting:</strong> Flag offensive users with automated reason categorization for immediate moderation review.</li>
</ul>
`,
      },
      {
        identifier: "about-us",
        title: "About FunChat",
        status: "active",
        content: `
<h2>About FunChat Connect</h2>
<p>FunChat was created to bring back the spontaneity and excitement of meeting new people from around the world — without complex signups, algorithmic feeds, or privacy compromises.</p>

<h3>Our Core Pillars</h3>
<ul>
  <li><strong>Speed:</strong> Instant matchmaker pairing in under 50 milliseconds.</li>
  <li><strong>Simplicity:</strong> Clean, frictionless interface designed for effortless real-time communication.</li>
  <li><strong>Privacy First:</strong> Anonymous by default, built with peer-to-peer WebRTC technology.</li>
</ul>
`,
      },
      {
        identifier: "cookie-policy",
        title: "Cookie Policy",
        status: "active",
        content: `
<h2>Cookie & Local Storage Policy</h2>
<p>FunChat utilizes minimal browser local storage strictly necessary for basic app functionality (such as remembering your chosen display name and session preferences). We do not employ intrusive tracking cookies across external websites.</p>
`,
      },
    ];

    await CMSModel.insertMany(defaultPages);
    console.log("✅ Seeded default CMS pages successfully");
  } catch (error) {
    console.error("Error seeding CMS pages:", error);
  }
};

