"use client"

import * as React from "react"
import Link from "next/link"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { ChevronsUpDownIcon } from "lucide-react"
import { formatDuration } from "@/lib/format"

/** Plain-language names. The two legacy states describe combinations the old
 *  API allowed and the four protection levels no longer produce — they are
 *  shown as-is, never rewritten into a policy the creator did not choose. */
const PROTECTION_LABEL: Record<string, string> = {
  public: "anyone with the link",
  email: "email",
  email_password: "email + password",
  password: "password",
  link_only_legacy: "link-only (legacy)",
  password_no_recipient_legacy: "password, no recipient (legacy)",
}

export interface SharesTableRow {
  id: string
  artifactId: string
  artifactTitle: string
  recipientLabel: string | null
  mode: string
  protection: string
  status: "active" | "revoked" | "expired"
  views: number
  uniqueViewers: number
  reopens: number
  forwards: number
  avgDwellMs: number
  perSlideDwellMs: { slideIndex: number; totalMs: number }[]
  coverage: number | null
}

type SortKey =
  | "artifactTitle"
  | "views"
  | "uniqueViewers"
  | "reopens"
  | "forwards"
  | "avgDwellMs"

const NUMERIC: Set<SortKey> = new Set([
  "views",
  "uniqueViewers",
  "reopens",
  "forwards",
  "avgDwellMs",
])

export function SharesTable({ rows }: { rows: SharesTableRow[] }) {
  const [artifactFilter, setArtifactFilter] = React.useState("all")
  const [modeFilter, setModeFilter] = React.useState("all")
  const [sortKey, setSortKey] = React.useState<SortKey>("views")
  const [sortDir, setSortDir] = React.useState<"asc" | "desc">("desc")
  const [selected, setSelected] = React.useState<string | null>(null)

  const artifacts = React.useMemo(
    () => Array.from(new Set(rows.map((r) => r.artifactTitle))).sort(),
    [rows],
  )

  const filtered = React.useMemo(() => {
    const out = rows.filter(
      (r) =>
        (artifactFilter === "all" || r.artifactTitle === artifactFilter) &&
        (modeFilter === "all" || r.mode === modeFilter),
    )
    out.sort((a, b) => {
      const av = a[sortKey]
      const bv = b[sortKey]
      let cmp: number
      if (NUMERIC.has(sortKey)) cmp = (av as number) - (bv as number)
      else cmp = String(av).localeCompare(String(bv))
      return sortDir === "asc" ? cmp : -cmp
    })
    return out
  }, [rows, artifactFilter, modeFilter, sortKey, sortDir])

  function toggleSort(key: SortKey) {
    if (key === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"))
    } else {
      setSortKey(key)
      setSortDir(NUMERIC.has(key) ? "desc" : "asc")
    }
  }

  const columns: { key: SortKey; label: string; numeric?: boolean }[] = [
    { key: "artifactTitle", label: "Artifact" },
    { key: "views", label: "Views", numeric: true },
    { key: "uniqueViewers", label: "Unique", numeric: true },
    { key: "reopens", label: "Reopens", numeric: true },
    { key: "forwards", label: "Fwd", numeric: true },
    { key: "avgDwellMs", label: "Avg dwell", numeric: true },
  ]

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        <Select value={artifactFilter} onValueChange={setArtifactFilter}>
          <SelectTrigger className="w-[180px]" aria-label="Filter by artifact">
            <SelectValue placeholder="All artifacts" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All artifacts</SelectItem>
            {artifacts.map((a) => (
              <SelectItem key={a} value={a}>
                {a}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={modeFilter} onValueChange={setModeFilter}>
          <SelectTrigger className="w-[150px]" aria-label="Filter by mode">
            <SelectValue placeholder="All modes" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All modes</SelectItem>
            <SelectItem value="recipient">recipient</SelectItem>
            <SelectItem value="public">public</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              {columns.map((c) => (
                <TableHead
                  key={c.key}
                  className={c.numeric ? "text-right" : ""}
                >
                  <button
                    type="button"
                    onClick={() => toggleSort(c.key)}
                    className="inline-flex items-center gap-1 hover:text-foreground"
                  >
                    {c.label}
                    <ChevronsUpDownIcon className="size-3 opacity-50" />
                  </button>
                </TableHead>
              ))}
              <TableHead className="text-right">Coverage</TableHead>
              <TableHead>Recipient</TableHead>
              <TableHead>Protection</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="sr-only">Detail</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={11} className="text-center text-muted-foreground">
                  No shares match these filters.
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((r) => {
                const isOpen = selected === r.id
                const canDrill = r.perSlideDwellMs.length > 0
                return (
                  <React.Fragment key={r.id}>
                    <TableRow
                      data-state={isOpen ? "selected" : undefined}
                      className={canDrill ? "cursor-pointer" : ""}
                      onClick={() =>
                        canDrill && setSelected(isOpen ? null : r.id)
                      }
                    >
                      <TableCell className="font-medium">
                        {r.artifactTitle}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {r.views.toLocaleString()}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {r.uniqueViewers.toLocaleString()}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {r.reopens.toLocaleString()}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {r.forwards > 0 ? (
                          <span className="text-warning">⚠ {r.forwards}</span>
                        ) : (
                          0
                        )}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatDuration(r.avgDwellMs)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {r.coverage != null ? `${Math.round(r.coverage * 100)}%` : "—"}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {r.recipientLabel ?? "—"}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={
                            r.protection.endsWith("_legacy")
                              ? "text-muted-foreground"
                              : ""
                          }
                        >
                          {PROTECTION_LABEL[r.protection] ?? r.protection}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            r.status === "active" ? "secondary" : "destructive"
                          }
                        >
                          {r.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <Link
                          href={`/artifacts/${r.artifactId}/shares/${r.id}`}
                          onClick={(e) => e.stopPropagation()}
                          className="text-xs font-medium text-primary hover:underline"
                        >
                          Detail →
                        </Link>
                      </TableCell>
                    </TableRow>
                    {isOpen && (
                      <TableRow>
                        <TableCell colSpan={11} className="bg-muted/30">
                          <PerSlideDwell slides={r.perSlideDwellMs} />
                        </TableCell>
                      </TableRow>
                    )}
                  </React.Fragment>
                )
              })
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}

function PerSlideDwell({
  slides,
}: {
  slides: { slideIndex: number; totalMs: number }[]
}) {
  const max = Math.max(...slides.map((s) => s.totalMs), 1)
  return (
    <div className="flex flex-col gap-1 py-1">
      <p className="text-xs font-medium text-muted-foreground">
        Per-slide dwell
      </p>
      {slides.map((s) => (
        <div key={s.slideIndex} className="flex items-center gap-2 text-xs">
          <span className="w-8 shrink-0 tabular-nums text-muted-foreground">
            s{s.slideIndex}
          </span>
          <div className="h-2 flex-1 overflow-hidden rounded bg-muted">
            <div
              className="h-full rounded bg-primary"
              style={{ width: `${Math.round((s.totalMs / max) * 100)}%` }}
            />
          </div>
          <span className="w-14 shrink-0 text-right tabular-nums text-muted-foreground">
            {formatDuration(s.totalMs)}
          </span>
        </div>
      ))}
    </div>
  )
}
