const { getJsonBody } = require("./_lib/parse-body");
const { getSupabaseAdmin } = require("./_lib/supabase");
const { analyzeSkill } = require("./_lib/ai-client");

function getBearerToken(req) {
  const header = req.headers?.authorization || req.headers?.Authorization || "";
  if (!header.startsWith("Bearer ")) return "";
  return header.slice("Bearer ".length).trim();
}

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, message: "Method not allowed" });
  }

  const body = await getJsonBody(req);
  const skillId = String(body.skillId || "").trim();
  const userDescription = String(body.userDescription || "").trim().slice(0, 800);

  if (!skillId) {
    return res.status(400).json({ ok: false, message: "Missing skillId" });
  }

  const token = getBearerToken(req);
  if (!token) {
    return res.status(401).json({ ok: false, message: "Missing auth token" });
  }

  const supabase = getSupabaseAdmin();
  const { data: userData, error: userError } = await supabase.auth.getUser(token);
  if (userError || !userData?.user) {
    return res.status(401).json({ ok: false, message: "Invalid auth token" });
  }
  const userId = userData.user.id;

  const relResult = await supabase
    .from("user_skills")
    .select("id")
    .eq("user_id", userId)
    .eq("skill_id", skillId)
    .maybeSingle();
  if (relResult.error || !relResult.data) {
    return res.status(403).json({ ok: false, message: "Not allowed" });
  }

  const skillResult = await supabase
    .from("skills")
    .select("id, name, description")
    .eq("id", skillId)
    .maybeSingle();
  if (skillResult.error || !skillResult.data) {
    return res.status(404).json({ ok: false, message: "Skill not found" });
  }

  let latestVersion = 0;
  const versionResult = await supabase
    .from("skill_analysis")
    .select("version")
    .eq("user_id", userId)
    .eq("skill_id", skillId)
    .order("version", { ascending: false })
    .limit(1);
  if (!versionResult.error && versionResult.data?.length) {
    latestVersion = Number(versionResult.data[0].version) || 0;
  }

  try {
    const { analysis, model } = await analyzeSkill({
      name: skillResult.data.name,
      description: skillResult.data.description || "",
      userDescription
    });

    const insertResult = await supabase
      .from("skill_analysis")
      .insert({
        skill_id: skillId,
        user_id: userId,
        json_result: analysis,
        model,
        version: latestVersion + 1
      })
      .select("id, version, created_at")
      .single();

    if (insertResult.error) {
      return res.status(500).json({ ok: false, message: "Save failed" });
    }

    return res.json({
      ok: true,
      data: {
        ...analysis,
        model,
        version: insertResult.data.version,
        createdAt: insertResult.data.created_at
      }
    });
  } catch (err) {
    return res.status(500).json({ ok: false, message: err.message || "Analyze failed" });
  }
};
