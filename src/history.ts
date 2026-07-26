export type StatusValue = "planned" | "completed";

export type StatusHistoryItem = string;

export function localDateString(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function ratingPatch(stars: number) {
  if (!Number.isInteger(stars) || stars < 1 || stars > 5) throw new RangeError("Stars must be a whole number from 1 to 5.");
  return { personalRating: stars * 2, status: "completed", finished_date: localDateString(), __statusHistoryAction: `评分：${stars * 2}分` };
}

export function statusPatch(status: StatusValue, labels: { planned: string; completed: string }) {
  return { status, finished_date: localDateString(), __statusHistoryAction: labels[status] };
}

export function commentPatch(comment: string, completedLabel: string) {
  return { comment, status: "completed", finished_date: localDateString(), __statusHistoryAction: `${completedLabel}（短评）` };
}

export function applyStatusHistory(frontmatter: Record<string, any>, patch: Record<string, any>): void {
  const action = patch.__statusHistoryAction;
  if (!action) return;
  const history: StatusHistoryItem[] = Array.isArray(frontmatter.status_history)
    ? frontmatter.status_history.map((item: any) => typeof item === "string" ? item : `${item?.date || ""} | ${item?.action || ""}`.trim())
    : [];
  const previousDate = frontmatter.finished_date;
  if (previousDate && previousDate !== patch.finished_date && !history.some((item) => item.startsWith(`${previousDate} |`))) {
    history.push(`${previousDate} | ${frontmatter.status === "completed" ? "看过" : "想看"}`);
  }
  history.push(`${patch.finished_date || localDateString()} | ${action}`);
  frontmatter.status_history = history;
}
