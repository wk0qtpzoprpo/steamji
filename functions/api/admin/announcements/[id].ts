// 公告管理（仅管理员）：DELETE 删除公告
import type { PagesFunction } from "@cloudflare/workers-types";
import type { Env } from "../../../lib/db.ts";
import { ok, fail } from "../../../lib/db.ts";

export const onRequestDelete: PagesFunction<Env> = async ({ env, data, params }) => {
  const user = data.user as { role: string };
  if (user.role !== "admin") return fail("需要管理员权限", 403);
  const id = Number(params.id);
  if (!Number.isInteger(id) || id <= 0) return fail("无效的公告 ID");
  const del = await env.DB.prepare("DELETE FROM announcements WHERE id = ?").bind(id).run();
  if (del.meta.changes === 0) return fail("公告不存在", 404);
  return ok({}, "公告已删除");
};
