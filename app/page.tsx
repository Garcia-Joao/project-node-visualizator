"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  ReactFlow,
  Background,
  BackgroundVariant,
  Controls,
  Handle,
  MarkerType,
  MiniMap,
  Position,
  useEdgesState,
  useNodesState,
  type Edge,
  type Node,
  type NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import {
  ArrowLeft,
  ArrowRight,
  Box,
  ChevronRight,
  Code2,
  Compass,
  Database,
  Eye,
  FileCode2,
  FolderTree,
  GitBranch,
  Keyboard,
  Layers3,
  LocateFixed,
  Maximize2,
  MousePointerClick,
  Network,
  PanelRightClose,
  PanelRightOpen,
  RotateCcw,
  Search,
  Settings,
  Sparkles,
  Workflow,
  X,
  Filter,
  ChevronDown,
  Home,
  ZoomIn,
  Info,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import graphJson from "@/data/projectItems.json";

// ─── Types ──────────────────────────────────────────────────────────────────

type ProjectItem = {
  id: string;
  name: string;
  path?: string;
  type?: string;
  layer?: string;
  description?: string;
  responsibilities?: string[];
  dependsOn?: string[];
};

type GraphMeta = {
  schemaVersion?: number;
  projectId?: string;
  title?: string;
  subtitle?: string;
  startNodeId?: string;
  defaultMode?: ViewMode;
  relationLabels?: { dependsOn?: string; usedBy?: string; indirect?: string };
  relationColors?: { dependency?: string; usedBy?: string; indirect?: string; default?: string };
  layout?: Partial<LayoutConfig>;
  layers?: string[];
  typeStyles?: Record<string, TypeStyle>;
};

type GraphData = { meta?: GraphMeta; nodes?: ProjectItem[] };
type TypeStyle = { label?: string; accent?: string; background?: string };

type LayoutConfig = {
  nodeWidth: number; nodeHeight: number; nodeGap: number;
  flowColumnGap: number; flowRowGap: number;
  levelColumnGap: number; levelRowGap: number;
  radialRadiusStep: number;
};

type ViewMode = "flow" | "levels" | "full";
type NodeRelation = "selected" | "dependency" | "used-by" | "indirect" | "none";

type ProjectNodeData = {
  item: ProjectItem;
  selected: boolean;
  relation: NodeRelation;
  muted: boolean;
  typeStyle: Required<TypeStyle>;
  onSelect: (id: string) => void;
  onEnter: (id: string) => void;
};

type ProjectFlowNode = Node<ProjectNodeData, "projectNode">;

// ─── Data bootstrap ──────────────────────────────────────────────────────────

const rawGraph = graphJson as GraphData | ProjectItem[];
const graphData: GraphData = Array.isArray(rawGraph) ? { meta: {}, nodes: rawGraph } : rawGraph;
const projectItems = graphData.nodes ?? [];
const meta = graphData.meta ?? {};

const defaultLayout: LayoutConfig = {
  nodeWidth: 300, nodeHeight: 176, nodeGap: 48,
  flowColumnGap: 420, flowRowGap: 230,
  levelColumnGap: 560, levelRowGap: 230,
  radialRadiusStep: 290,
};
const layoutConfig: LayoutConfig = { ...defaultLayout, ...(meta.layout ?? {}) };
const startNodeId = meta.startNodeId ?? projectItems[0]?.id ?? "";
const storagePrefix = `handover-map:${meta.projectId ?? "generic-project"}`;

const relationLabels = {
  dependsOn: meta.relationLabels?.dependsOn ?? "Depends on",
  usedBy: meta.relationLabels?.usedBy ?? "Used by",
  indirect: meta.relationLabels?.indirect ?? "Indirect",
};

const relationColors = {
  dependency: meta.relationColors?.dependency ?? "#38bdf8",
  usedBy: meta.relationColors?.usedBy ?? "#fbbf24",
  indirect: meta.relationColors?.indirect ?? "#a78bfa",
  default: meta.relationColors?.default ?? "rgba(255,255,255,0.14)",
};

// ─── Icon helpers ────────────────────────────────────────────────────────────

const typeIconRules: Array<{ test: RegExp; icon: LucideIcon }> = [
  { test: /view|screen|page/i, icon: Eye },
  { test: /viewmodel|vm|state/i, icon: MousePointerClick },
  { test: /model|data|entity/i, icon: Database },
  { test: /service|helper|utility/i, icon: Settings },
  { test: /factory|component|control/i, icon: Box },
  { test: /command|action/i, icon: GitBranch },
  { test: /resource|asset|dictionary/i, icon: FolderTree },
  { test: /bootstrap|startup|app/i, icon: Workflow },
  { test: /code|converter|behavior/i, icon: Code2 },
];

function getTypeIcon(type: string | undefined): LucideIcon {
  return typeIconRules.find(r => r.test.test(type ?? ""))?.icon ?? FileCode2;
}

function getTypeStyle(type: string | undefined): Required<TypeStyle> {
  const key = type ?? "Unknown";
  const style = meta.typeStyles?.[key] ?? {};
  return {
    label: style.label ?? key,
    accent: style.accent ?? "#e5e7eb",
    background: style.background ?? "rgba(229,231,235,0.08)",
  };
}

// ─── Data helpers ─────────────────────────────────────────────────────────────

function itemById(id: string) { return projectItems.find(i => i.id === id); }
function unique<T>(values: T[]) { return Array.from(new Set(values)); }
function truncate(text: string | undefined, max = 90) {
  const v = text ?? "";
  return v.length <= max ? v : `${v.slice(0, max)}…`;
}

function buildUsedByMap(items: ProjectItem[]) {
  const map = new Map<string, string[]>();
  items.forEach(item => {
    (item.dependsOn ?? []).forEach(depId => {
      const cur = map.get(depId) ?? [];
      cur.push(item.id);
      map.set(depId, cur);
    });
  });
  return map;
}

function matchesQuery(item: ProjectItem, query: string) {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return [item.name, item.path, item.type, item.layer, item.description, ...(item.responsibilities ?? [])]
    .filter(Boolean).join(" ").toLowerCase().includes(q);
}

function getLayers(items: ProjectItem[]) {
  const configured = meta.layers ?? [];
  const discovered = unique(items.map(i => i.layer ?? "Uncategorized"));
  return [
    ...configured.filter(l => discovered.includes(l)),
    ...discovered.filter(l => !configured.includes(l)),
  ];
}

function getRelationship(itemId: string, sel: ProjectItem | undefined, usedByMap: Map<string, string[]>): NodeRelation {
  if (!sel) return "none";
  if (itemId === sel.id) return "selected";
  if ((sel.dependsOn ?? []).includes(itemId)) return "dependency";
  if ((usedByMap.get(sel.id) ?? []).includes(itemId)) return "used-by";

  const secondLevel = new Set<string>();
  (sel.dependsOn ?? []).forEach(depId => {
    const dep = itemById(depId);
    (dep?.dependsOn ?? []).forEach(nextId => secondLevel.add(nextId));
  });
  (usedByMap.get(sel.id) ?? []).forEach(userId => {
    const user = itemById(userId);
    (user?.dependsOn ?? []).forEach(nextId => secondLevel.add(nextId));
  });
  return secondLevel.has(itemId) ? "indirect" : "none";
}

// ─── Persistence ─────────────────────────────────────────────────────────────

function storageKey(mode: ViewMode, rootId: string) {
  return `${storagePrefix}:${mode}:${rootId}`;
}
function readSavedPositions(mode: ViewMode, rootId: string) {
  try {
    const raw = typeof window !== "undefined" ? window.localStorage.getItem(storageKey(mode, rootId)) : null;
    if (!raw) return new Map<string, { x: number; y: number }>();
    return new Map(Object.entries(JSON.parse(raw) as Record<string, { x: number; y: number }>));
  } catch { return new Map<string, { x: number; y: number }>(); }
}
function savePositions(mode: ViewMode, rootId: string, nodes: ProjectFlowNode[]) {
  if (typeof window === "undefined") return;
  const positions: Record<string, { x: number; y: number }> = {};
  nodes.forEach(n => { positions[n.id] = { x: n.position.x, y: n.position.y }; });
  window.localStorage.setItem(storageKey(mode, rootId), JSON.stringify(positions));
}
function clearSavedPositions(mode: ViewMode, rootId: string) {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(storageKey(mode, rootId));
}
function clearAllSavedPositions() {
  if (typeof window === "undefined") return;
  Object.keys(window.localStorage).forEach(k => { if (k.startsWith(storagePrefix)) window.localStorage.removeItem(k); });
}
function hasSavedPositions(mode: ViewMode, rootId: string) {
  return readSavedPositions(mode, rootId).size > 0;
}
function applySavedPositions(mode: ViewMode, rootId: string, nodes: ProjectFlowNode[]) {
  const saved = readSavedPositions(mode, rootId);
  return nodes.map(n => { const s = saved.get(n.id); return s ? { ...n, position: s } : n; });
}

// ─── Layout helpers ──────────────────────────────────────────────────────────

function getNodeBounds(node: ProjectFlowNode) {
  return { x: node.position.x, y: node.position.y, width: layoutConfig.nodeWidth, height: layoutConfig.nodeHeight };
}
function boundsOverlap(
  a: { x: number; y: number; width: number; height: number },
  b: { x: number; y: number; width: number; height: number }
) {
  return !(
    a.x + a.width + layoutConfig.nodeGap <= b.x ||
    b.x + b.width + layoutConfig.nodeGap <= a.x ||
    a.y + a.height + layoutConfig.nodeGap <= b.y ||
    b.y + b.height + layoutConfig.nodeGap <= a.y
  );
}
function collidesWithPlacedNodes(node: ProjectFlowNode, placed: ProjectFlowNode[]) {
  const nb = getNodeBounds(node);
  return placed.some(p => boundsOverlap(nb, getNodeBounds(p)));
}
function findNonOverlappingPosition(node: ProjectFlowNode, placed: ProjectFlowNode[]) {
  if (!collidesWithPlacedNodes(node, placed)) return node.position;
  const origin = node.position;
  const hs = layoutConfig.nodeWidth + 110;
  const vs = layoutConfig.nodeHeight + 90;
  for (let attempt = 1; attempt <= 128; attempt++) {
    const ring = Math.ceil(attempt / 8);
    const slot = attempt % 8;
    const offsets = [
      { x: hs * ring, y: 0 }, { x: -hs * ring, y: 0 }, { x: 0, y: vs * ring }, { x: 0, y: -vs * ring },
      { x: hs * ring, y: vs * ring }, { x: hs * ring, y: -vs * ring },
      { x: -hs * ring, y: vs * ring }, { x: -hs * ring, y: -vs * ring },
    ];
    const candidate: ProjectFlowNode = { ...node, position: { x: origin.x + offsets[slot].x, y: origin.y + offsets[slot].y } };
    if (!collidesWithPlacedNodes(candidate, placed)) return candidate.position;
  }
  return { x: origin.x, y: origin.y + (placed.length + 1) * vs };
}
function preventInitialNodeOverlaps(nodes: ProjectFlowNode[]) {
  const placed: ProjectFlowNode[] = [];
  return nodes.map(n => {
    const pos = findNonOverlappingPosition(n, placed);
    const next = { ...n, position: pos };
    placed.push(next);
    return next;
  });
}

// ─── Node builders ────────────────────────────────────────────────────────────

function createProjectNode(
  item: ProjectItem,
  position: { x: number; y: number },
  selectedItem: ProjectItem | undefined,
  usedByMap: Map<string, string[]>,
  onSelect: (id: string) => void,
  onEnter: (id: string) => void,
): ProjectFlowNode {
  const relation = getRelationship(item.id, selectedItem, usedByMap);
  const hasContext = Boolean(selectedItem);
  return {
    id: item.id,
    type: "projectNode",
    position,
    draggable: true,
    selectable: false,
    data: {
      item, selected: selectedItem?.id === item.id,
      relation, muted: hasContext && relation === "none",
      typeStyle: getTypeStyle(item.type),
      onSelect, onEnter,
    },
  };
}

function collectAroundRoot(root: ProjectItem, usedByMap: Map<string, string[]>, depth = 2) {
  const ids = new Set<string>([root.id]);
  let frontier = [root.id];
  for (let level = 0; level < depth; level++) {
    const next: string[] = [];
    frontier.forEach(id => {
      const item = itemById(id);
      [...(item?.dependsOn ?? []), ...(usedByMap.get(id) ?? [])].forEach(rid => {
        if (!ids.has(rid)) { ids.add(rid); next.push(rid); }
      });
    });
    frontier = next;
  }
  return ids;
}

function collectFlowFromStart(startId: string, usedByMap: Map<string, string[]>, depth = 4) {
  const startItem = itemById(startId) ?? projectItems[0];
  if (!startItem) return new Set<string>();
  const ids = new Set<string>([startItem.id]);
  let frontier = [startItem.id];
  for (let level = 0; level < depth; level++) {
    const next: string[] = [];
    frontier.forEach(id => {
      const item = itemById(id);
      const outgoing = item?.dependsOn ?? [];
      const incoming = usedByMap.get(id) ?? [];
      const related = level === 0 ? [...outgoing, ...incoming] : outgoing;
      related.forEach(rid => { if (!ids.has(rid)) { ids.add(rid); next.push(rid); } });
    });
    frontier = next;
  }
  return ids;
}

function getVisibleItems(
  mode: ViewMode, root: ProjectItem | undefined,
  usedByMap: Map<string, string[]>, query: string, layerFilter: string | null
) {
  let items: ProjectItem[];
  if (mode === "full") {
    items = projectItems.filter(i => matchesQuery(i, query));
  } else {
    const effectiveRoot = root ?? itemById(startNodeId) ?? projectItems[0];
    if (!effectiveRoot) return [];
    const ids = mode === "flow"
      ? collectFlowFromStart(startNodeId, usedByMap, 4)
      : collectAroundRoot(effectiveRoot, usedByMap, 2);
    items = projectItems.filter(i => ids.has(i.id) && matchesQuery(i, query));
  }
  if (layerFilter) items = items.filter(i => (i.layer ?? "Uncategorized") === layerFilter);
  return items;
}

function buildFullProjectNodes(
  items: ProjectItem[], selectedItem: ProjectItem | undefined,
  usedByMap: Map<string, string[]>,
  onSelect: (id: string) => void, onEnter: (id: string) => void,
): ProjectFlowNode[] {
  const layers = getLayers(items);
  const result: ProjectFlowNode[] = [];
  layers.forEach((layer, li) => {
    const layerItems = items.filter(i => (i.layer ?? "Uncategorized") === layer);
    const radius = 280 + li * layoutConfig.radialRadiusStep;
    const angleOffset = li * 0.31;
    layerItems.forEach((item, ii) => {
      const angle = angleOffset + (Math.PI * 2 * ii) / Math.max(layerItems.length, 1);
      result.push(createProjectNode(item, { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius }, selectedItem, usedByMap, onSelect, onEnter));
    });
  });
  return result;
}

function buildLevelsNodes(
  items: ProjectItem[], root: ProjectItem | undefined,
  usedByMap: Map<string, string[]>,
  onSelect: (id: string) => void, onEnter: (id: string) => void,
): ProjectFlowNode[] {
  const effectiveRoot = root ?? itemById(startNodeId) ?? projectItems[0];
  if (!effectiveRoot) return [];
  const positions = new Map<string, { x: number; y: number }>();
  const visibleIds = new Set(items.map(i => i.id));

  const usedByItems = (usedByMap.get(effectiveRoot.id) ?? [])
    .map(itemById).filter((i): i is ProjectItem => Boolean(i) && visibleIds.has(i!.id));
  const depItems = (effectiveRoot.dependsOn ?? [])
    .map(itemById).filter((i): i is ProjectItem => Boolean(i) && visibleIds.has(i!.id));

  positions.set(effectiveRoot.id, { x: 0, y: 0 });
  usedByItems.forEach((item, i) => {
    positions.set(item.id, { x: -layoutConfig.levelColumnGap, y: (i - (usedByItems.length - 1) / 2) * layoutConfig.levelRowGap });
  });
  depItems.forEach((item, i) => {
    positions.set(item.id, { x: layoutConfig.levelColumnGap, y: (i - (depItems.length - 1) / 2) * layoutConfig.levelRowGap });
  });

  const secondLevel = new Set<string>();
  depItems.forEach(i => (i.dependsOn ?? []).forEach(id => secondLevel.add(id)));
  usedByItems.forEach(i => (usedByMap.get(i.id) ?? []).forEach(id => secondLevel.add(id)));

  const secondItems = Array.from(secondLevel)
    .map(itemById).filter((i): i is ProjectItem => Boolean(i) && visibleIds.has(i!.id) && !positions.has(i!.id));

  secondItems.forEach((item, i) => {
    const isDep = depItems.some(d => (d.dependsOn ?? []).includes(item.id));
    positions.set(item.id, {
      x: isDep ? layoutConfig.levelColumnGap * 2 : -layoutConfig.levelColumnGap * 2,
      y: (i - (secondItems.length - 1) / 2) * layoutConfig.levelRowGap,
    });
  });

  return items.map((item, i) =>
    createProjectNode(item, positions.get(item.id) ?? { x: 0, y: 340 + i * layoutConfig.levelRowGap }, effectiveRoot, usedByMap, onSelect, onEnter)
  );
}

function buildFlowNodes(
  items: ProjectItem[], selectedItem: ProjectItem | undefined,
  usedByMap: Map<string, string[]>,
  onSelect: (id: string) => void, onEnter: (id: string) => void,
): ProjectFlowNode[] {
  const root = itemById(startNodeId) ?? projectItems[0];
  if (!root) return [];
  const visibleIds = new Set(items.map(i => i.id));
  const levels = new Map<string, number>();
  const queue: Array<{ id: string; level: number }> = [{ id: root.id, level: 0 }];
  levels.set(root.id, 0);

  while (queue.length > 0) {
    const current = queue.shift()!;
    const currentItem = itemById(current.id);
    const nextIds = current.level === 0
      ? [...(currentItem?.dependsOn ?? []), ...(usedByMap.get(current.id) ?? [])]
      : currentItem?.dependsOn ?? [];
    nextIds.forEach(nextId => {
      if (!visibleIds.has(nextId) || levels.has(nextId)) return;
      const nextLevel = current.level + 1;
      levels.set(nextId, nextLevel);
      queue.push({ id: nextId, level: nextLevel });
    });
  }

  items.forEach(item => {
    if (!levels.has(item.id)) {
      const li = getLayers(items).indexOf(item.layer ?? "Uncategorized");
      levels.set(item.id, Math.max(li, 1));
    }
  });

  const grouped = new Map<number, ProjectItem[]>();
  items.forEach(item => {
    const level = levels.get(item.id) ?? 0;
    grouped.set(level, [...(grouped.get(level) ?? []), item]);
  });

  const result: ProjectFlowNode[] = [];
  Array.from(grouped.entries()).sort(([a], [b]) => a - b).forEach(([level, levelItems]) => {
    levelItems.forEach((item, i) => {
      result.push(createProjectNode(item, {
        x: level * layoutConfig.flowColumnGap,
        y: (i - (levelItems.length - 1) / 2) * layoutConfig.flowRowGap,
      }, selectedItem, usedByMap, onSelect, onEnter));
    });
  });
  return result;
}

function buildEdges(
  visibleItems: ProjectItem[], selectedItem: ProjectItem | undefined,
  usedByMap: Map<string, string[]>
): Edge[] {
  const visibleIds = new Set(visibleItems.map(i => i.id));
  const edges: Edge[] = [];
  const selectedNodeId = selectedItem?.id;
  const hasSelected = typeof selectedNodeId === "string";
  const selectedDeps = selectedItem?.dependsOn ?? [];
  const selectedUsedBy = selectedNodeId ? usedByMap.get(selectedNodeId) ?? [] : [];

  visibleItems.forEach(item => {
    (item.dependsOn ?? []).forEach(depId => {
      if (!visibleIds.has(depId)) return;
      const isDepEdge = hasSelected && selectedNodeId === item.id && selectedDeps.includes(depId);
      const isUsedByEdge = hasSelected && item.dependsOn?.includes(selectedNodeId) && depId === selectedNodeId;
      const isHighlighted = isDepEdge || isUsedByEdge ||
        (hasSelected && selectedNodeId === item.id) ||
        (hasSelected && selectedNodeId === depId) ||
        selectedUsedBy.includes(item.id);

      let stroke = relationColors.default;
      let strokeWidth = 1.8;
      if (isDepEdge) { stroke = relationColors.dependency; strokeWidth = 4; }
      else if (isUsedByEdge) { stroke = relationColors.usedBy; strokeWidth = 4; }
      else if (isHighlighted) { stroke = relationColors.indirect; strokeWidth = 2.8; }

      edges.push({
        id: `${item.id}->${depId}`,
        source: item.id, target: depId,
        type: "smoothstep",
        animated: isHighlighted,
        markerEnd: { type: MarkerType.ArrowClosed, width: 20, height: 20 },
        style: { stroke, strokeWidth, opacity: hasSelected && !isHighlighted ? 0.25 : 1 },
      });
    });
  });
  return edges;
}

// ─── Node component ──────────────────────────────────────────────────────────

function relationStyle(relation: NodeRelation, selected: boolean, muted: boolean) {
  if (selected) return {
    opacity: 1,
    transform: "scale(1.025)",
    boxShadow: "0 0 0 2px rgba(255,255,255,0.85), 0 20px 60px rgba(0,0,0,0.4)",
  };
  if (relation === "dependency") return { opacity: 1, boxShadow: `0 0 0 2px ${relationColors.dependency}99` };
  if (relation === "used-by") return { opacity: 1, boxShadow: `0 0 0 2px ${relationColors.usedBy}99` };
  if (relation === "indirect") return { opacity: 0.9, boxShadow: `0 0 0 1px ${relationColors.indirect}66` };
  if (muted) return { opacity: 0.28 };
  return { opacity: 1 };
}

function RelationPill({ relation }: { relation: NodeRelation }) {
  const styles: Record<string, { color: string; label: string }> = {
    "dependency": { color: relationColors.dependency, label: relationLabels.dependsOn },
    "used-by": { color: relationColors.usedBy, label: relationLabels.usedBy },
    "indirect": { color: relationColors.indirect, label: relationLabels.indirect },
  };
  const s = styles[relation];
  if (!s) return null;
  return (
    <span className="rounded-full border px-2 py-0.5 text-[10px] font-medium tracking-wide"
      style={{ borderColor: `${s.color}44`, background: `${s.color}18`, color: s.color }}>
      {s.label}
    </span>
  );
}

function ProjectNode({ data }: NodeProps<ProjectFlowNode>) {
  const { item, selected, relation, muted, onSelect, onEnter, typeStyle } = data;
  const Icon = getTypeIcon(item.type);
  const depCount = item.dependsOn?.length ?? 0;

  return (
    <div className="relative group/node">
      <Handle type="target" position={Position.Left} className="!h-2.5 !w-2.5 !border !border-white/20 !bg-zinc-900" />

      <motion.div
        whileHover={{ y: -2, scale: 1.008 }}
        className="w-[300px] rounded-[1.25rem] border backdrop-blur-2xl transition-shadow duration-200"
        style={{
          borderColor: selected ? "rgba(255,255,255,0.55)" : `${typeStyle.accent}44`,
          background: selected ? "rgba(255,255,255,0.07)" : typeStyle.background,
          color: "white",
          ...relationStyle(relation, selected, muted),
        }}
      >
        {/* Header */}
        <div className="p-4 pb-3">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 shrink-0 rounded-xl border border-white/10 bg-black/30 p-2.5" style={{ color: typeStyle.accent }}>
              <Icon className="h-4 w-4" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold leading-tight text-white">{item.name}</p>
                  <p className="mt-0.5 truncate text-[11px] text-white/45">{item.layer ?? "Uncategorized"}</p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1.5">
                  <span className="rounded-full border border-white/10 bg-white/[0.07] px-2 py-0.5 text-[10px] font-medium text-white/70">
                    {typeStyle.label}
                  </span>
                  <RelationPill relation={relation} />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Body */}
        <div className="border-t border-white/[0.08] px-4 py-3">
          <p className="text-[11.5px] leading-relaxed text-white/62">{truncate(item.description, 92)}</p>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-white/[0.08] px-4 py-2.5">
          <div className="flex items-center gap-3 text-[11px] text-white/40">
            <span>{depCount} dep{depCount !== 1 ? "s" : ""}</span>
            {item.path && <span className="hidden truncate xl:block max-w-[100px] text-white/30">{item.path.split("/").pop()}</span>}
          </div>
          {/* Quick-action buttons shown on hover */}
          <div className="flex items-center gap-1 opacity-0 transition-opacity duration-150 group-hover/node:opacity-100">
            <button
              type="button"
              onClick={e => { e.stopPropagation(); onSelect(item.id); }}
              className="rounded-lg border border-white/10 bg-white/[0.06] px-2 py-1 text-[10px] text-white/70 hover:bg-white/10 hover:text-white transition-colors"
            >
              Select
            </button>
            <button
              type="button"
              onClick={e => { e.stopPropagation(); onEnter(item.id); }}
              className="rounded-lg border border-violet-300/25 bg-violet-500/15 px-2 py-1 text-[10px] text-violet-200 hover:bg-violet-500/25 transition-colors"
            >
              Enter →
            </button>
          </div>
        </div>
      </motion.div>

      <Handle type="source" position={Position.Right} className="!h-2.5 !w-2.5 !border !border-white/20 !bg-zinc-900" />
    </div>
  );
}

const nodeTypes = { projectNode: ProjectNode };

// ─── UI atoms ────────────────────────────────────────────────────────────────

function Panel({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-[1.5rem] border border-white/[0.08] bg-zinc-950/80 text-white shadow-2xl shadow-black/40 backdrop-blur-2xl ${className}`}>
      {children}
    </div>
  );
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded border border-white/15 bg-white/[0.07] px-1.5 font-mono text-[10px] text-white/60">
      {children}
    </kbd>
  );
}

function modeConfig(mode: ViewMode): { icon: React.ReactNode; label: string; desc: string } {
  if (mode === "flow") return { icon: <Workflow className="h-3.5 w-3.5" />, label: "Flow", desc: "Dependency flow from start node" };
  if (mode === "levels") return { icon: <Layers3 className="h-3.5 w-3.5" />, label: "Levels", desc: "Two hops around selected node" };
  return { icon: <Compass className="h-3.5 w-3.5" />, label: "Full", desc: "All nodes, radial layout" };
}

// ─── Layer filter pill ────────────────────────────────────────────────────────

function LayerFilter({ layers, activeLayer, layerCounts, onSelect }: {
  layers: string[];
  activeLayer: string | null;
  layerCounts: Record<string, number>;
  onSelect: (layer: string | null) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      <button
        type="button"
        onClick={() => onSelect(null)}
        className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-medium transition-all ${
          activeLayer === null
            ? "border-violet-300/40 bg-violet-500/25 text-white"
            : "border-white/10 bg-white/[0.04] text-white/55 hover:bg-white/[0.08] hover:text-white/80"
        }`}
      >
        All
      </button>
      {layers.map(layer => (
        <button
          key={layer}
          type="button"
          onClick={() => onSelect(activeLayer === layer ? null : layer)}
          className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-all ${
            activeLayer === layer
              ? "border-violet-300/40 bg-violet-500/25 text-white"
              : "border-white/10 bg-white/[0.04] text-white/55 hover:bg-white/[0.08] hover:text-white/80"
          }`}
        >
          {layer}
          {layerCounts[layer] !== undefined && (
            <span className="rounded-full bg-white/10 px-1.5 py-0.5 text-[9px] tabular-nums leading-none text-white/50">
              {layerCounts[layer]}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}

// ─── Main component ──────────────────────────────────────────────────────────

export default function Page() {
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const [mounted, setMounted] = useState(false);
  const [query, setQuery] = useState("");
  const [mode, setMode] = useState<ViewMode>((meta.defaultMode as ViewMode | undefined) ?? "flow");
  const [selectedId, setSelectedId] = useState<string | null>(startNodeId || null);
  const [breadcrumb, setBreadcrumb] = useState<string[]>(startNodeId ? [startNodeId] : []);
  const [detailsOpen, setDetailsOpen] = useState(true);
  const [showLayerFilter, setShowLayerFilter] = useState(false);
  const [layerFilter, setLayerFilter] = useState<string | null>(null);
  const [showShortcuts, setShowShortcuts] = useState(false);

  const [nodes, setNodes, onNodesChange] = useNodesState<ProjectFlowNode>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);

  const usedByMap = useMemo(() => buildUsedByMap(projectItems), []);

  const selectedItem = useMemo(() => {
    if (!selectedId) return undefined;
    return itemById(selectedId);
  }, [selectedId]);

  const rootId = selectedId ?? startNodeId;

  const allLayers = useMemo(() => getLayers(projectItems), []);
  const layerCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    projectItems.forEach(i => {
      const layer = i.layer ?? "Uncategorized";
      counts[layer] = (counts[layer] ?? 0) + 1;
    });
    return counts;
  }, []);

  const visibleItems = useMemo(
    () => getVisibleItems(mode, selectedItem, usedByMap, query, layerFilter),
    [mode, query, selectedItem, usedByMap, layerFilter]
  );

  const searchResults = useMemo(() => {
    if (!query.trim()) return [];
    return projectItems.filter(i => matchesQuery(i, query)).slice(0, 10);
  }, [query]);

  const selectedDeps = useMemo(() => {
    if (!selectedItem) return [];
    return (selectedItem.dependsOn ?? []).map(itemById).filter((i): i is ProjectItem => Boolean(i));
  }, [selectedItem]);

  const selectedUsedBy = useMemo(() => {
    if (!selectedItem) return [];
    return (usedByMap.get(selectedItem.id) ?? []).map(itemById).filter((i): i is ProjectItem => Boolean(i));
  }, [selectedItem, usedByMap]);

  const totalRelations = useMemo(
    () => projectItems.reduce((sum, i) => sum + (i.dependsOn?.length ?? 0), 0), []
  );

  const selectNode = useCallback((id: string) => { setSelectedId(id); }, []);
  const clearSelection = useCallback(() => { setSelectedId(null); }, []);

  const enterNode = useCallback((id: string) => {
    setSelectedId(id);
    setDetailsOpen(true);
    setMode("levels");
    setBreadcrumb(cur => {
      const idx = cur.indexOf(id);
      if (idx >= 0) return cur.slice(0, idx + 1);
      return [...cur, id];
    });
  }, []);

  const jumpToBreadcrumb = useCallback((id: string) => {
    setSelectedId(id);
    setDetailsOpen(true);
    setMode("levels");
    setBreadcrumb(cur => {
      const idx = cur.indexOf(id);
      return idx >= 0 ? cur.slice(0, idx + 1) : [id];
    });
  }, []);

  const goBackBreadcrumb = useCallback(() => {
    setBreadcrumb(cur => {
      if (cur.length <= 1) {
        const fallback = startNodeId || projectItems[0]?.id || null;
        setSelectedId(fallback);
        return fallback ? [fallback] : [];
      }
      const next = cur.slice(0, -1);
      setSelectedId(next[next.length - 1] ?? null);
      return next;
    });
    setMode("levels");
  }, []);

  const jumpToSearchResult = useCallback((id: string) => {
    setSelectedId(id);
    setDetailsOpen(true);
    setMode("levels");
    setQuery("");
    setBreadcrumb(cur => {
      if (cur.includes(id)) return cur.slice(0, cur.indexOf(id) + 1);
      return [...cur, id];
    });
  }, []);

  const resetToStart = useCallback(() => {
    const fallback = startNodeId || projectItems[0]?.id || null;
    setSelectedId(fallback);
    setDetailsOpen(true);
    setMode("flow");
    setBreadcrumb(fallback ? [fallback] : []);
    setQuery("");
    setLayerFilter(null);
  }, []);

  const resetCurrentLayout = useCallback(() => {
    clearSavedPositions(mode, rootId);
    window.location.reload();
  }, [mode, rootId]);

  const resetAllLayouts = useCallback(() => {
    clearAllSavedPositions();
    window.location.reload();
  }, []);

  // Mount
  useEffect(() => { setMounted(true); }, []);

  // Build graph
  useEffect(() => {
    if (!mounted) return;
    const root = selectedItem ?? itemById(startNodeId) ?? projectItems[0];
    let nextNodes: ProjectFlowNode[] = [];

    if (mode === "full") {
      nextNodes = buildFullProjectNodes(visibleItems, selectedItem, usedByMap, selectNode, enterNode);
    } else if (mode === "levels") {
      nextNodes = buildLevelsNodes(visibleItems, root, usedByMap, selectNode, enterNode);
    } else {
      nextNodes = buildFlowNodes(visibleItems, selectedItem, usedByMap, selectNode, enterNode);
    }

    const nextEdges = buildEdges(visibleItems, selectedItem, usedByMap);
    const layoutRootId = root?.id ?? startNodeId;
    const layoutNodes = hasSavedPositions(mode, layoutRootId) ? nextNodes : preventInitialNodeOverlaps(nextNodes);
    setNodes(applySavedPositions(mode, layoutRootId, layoutNodes));
    setEdges(nextEdges);
  }, [mode, mounted, query, selectNode, enterNode, selectedItem, setEdges, setNodes, usedByMap, visibleItems]);

  // Auto-save positions
  useEffect(() => {
    if (!mounted || nodes.length === 0 || !rootId) return;
    savePositions(mode, rootId, nodes);
  }, [mode, mounted, nodes, rootId]);

  // Keyboard shortcuts
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const isTyping = target?.tagName === "INPUT" || target?.tagName === "TEXTAREA" || Boolean(target?.isContentEditable);

      if (event.key === "/" && !isTyping) {
        event.preventDefault();
        searchInputRef.current?.focus();
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        if (query) { setQuery(""); return; }
        clearSelection();
        return;
      }
      if (isTyping) return;
      if (event.key === "Enter") { event.preventDefault(); if (selectedId) enterNode(selectedId); return; }
      if (event.key === "Backspace") { event.preventDefault(); goBackBreadcrumb(); return; }
      if (event.key === "1") setMode("flow");
      if (event.key === "2") setMode("levels");
      if (event.key === "3") setMode("full");
      if (event.key === "f") setShowLayerFilter(v => !v);
      if (event.key === "?") setShowShortcuts(v => !v);
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [clearSelection, enterNode, goBackBreadcrumb, query, selectedId]);

  const activeBreadcrumbItems = breadcrumb.map(itemById).filter((i): i is ProjectItem => Boolean(i));

  return (
    <main className="relative h-screen overflow-hidden bg-[#040408] text-white antialiased">
      {/* Ambient gradients */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_10%_10%,rgba(59,130,246,0.13),transparent_26%),radial-gradient(circle_at_85%_18%,rgba(139,92,246,0.11),transparent_28%),radial-gradient(circle_at_50%_92%,rgba(16,185,129,0.08),transparent_28%)]" />
      {/* Fine grid */}
      <div className="pointer-events-none absolute inset-0 opacity-30 [background-image:linear-gradient(rgba(255,255,255,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.03)_1px,transparent_1px)] [background-size:52px_52px]" />

      <section className="relative h-full w-full">

        {/* ── LEFT PANEL ── */}
        <div className="absolute left-4 top-4 z-30 w-[min(460px,calc(100vw-2rem))] space-y-2.5">

          {/* Title + search */}
          <Panel className="p-4">
            {/* Header row */}
            <div className="mb-3.5 flex items-start justify-between gap-3">
              <div>
                <div className="mb-1.5 inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[10.5px] text-white/55">
                  <Sparkles className="h-3 w-3" />
                  {meta.projectId ?? "project-map"}
                </div>
                <h1 className="text-lg font-semibold leading-tight tracking-tight">{meta.title ?? "Project Map"}</h1>
                <p className="mt-0.5 text-[11px] leading-relaxed text-white/40">{meta.subtitle ?? "Interactive dependency graph"}</p>
              </div>
              <button
                type="button"
                onClick={resetToStart}
                title="Return to start node"
                className="inline-flex h-8 items-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.04] px-2.5 text-[11px] text-white/70 transition hover:bg-white/[0.08] hover:text-white"
              >
                <Home className="h-3.5 w-3.5" />
                Start
              </button>
            </div>

            {/* Search */}
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-white/30" />
              <input
                ref={searchInputRef}
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="Search nodes, layers, types… Press /"
                className="h-10 w-full rounded-xl border border-white/10 bg-black/25 pl-9 pr-9 text-[13px] text-white outline-none placeholder:text-white/25 focus:border-white/20 transition-colors"
              />
              {query && (
                <button type="button" onClick={() => setQuery("")} className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-lg p-1 text-white/35 hover:text-white/70">
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            {/* Search results dropdown */}
            <AnimatePresence>
              {searchResults.length > 0 && (
                <motion.div
                  initial={{ opacity: 0, y: -4, scale: 0.99 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -4, scale: 0.99 }}
                  transition={{ duration: 0.12 }}
                  className="mt-2 max-h-64 overflow-y-auto rounded-xl border border-white/10 bg-zinc-900/90 backdrop-blur-xl"
                >
                  {searchResults.map(item => {
                    const style = getTypeStyle(item.type);
                    const Icon = getTypeIcon(item.type);
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => jumpToSearchResult(item.id)}
                        className="flex w-full items-center gap-3 border-b border-white/[0.05] px-3 py-2.5 text-left transition last:border-0 hover:bg-white/[0.06]"
                      >
                        <div className="shrink-0 rounded-lg border p-1.5" style={{ borderColor: `${style.accent}40`, background: style.background, color: style.accent }}>
                          <Icon className="h-3.5 w-3.5" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[12.5px] font-medium text-white/85">{item.name}</p>
                          <p className="truncate text-[11px] text-white/35">{item.layer} · {item.type}</p>
                        </div>
                        <ArrowRight className="h-3.5 w-3.5 shrink-0 text-white/30" />
                      </button>
                    );
                  })}
                </motion.div>
              )}
            </AnimatePresence>

            {/* Mode switcher */}
            <div className="mt-2.5 grid grid-cols-3 gap-1.5">
              {(["flow", "levels", "full"] as ViewMode[]).map(m => {
                const cfg = modeConfig(m);
                return (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setMode(m)}
                    title={cfg.desc}
                    className={`group inline-flex h-9 items-center justify-center gap-1.5 rounded-xl border px-3 text-[11.5px] font-medium transition-all ${
                      mode === m
                        ? "border-violet-300/35 bg-violet-500/20 text-white shadow-sm"
                        : "border-white/[0.07] bg-white/[0.03] text-white/55 hover:bg-white/[0.07] hover:text-white/85"
                    }`}
                  >
                    {cfg.icon}
                    {cfg.label}
                  </button>
                );
              })}
            </div>

            {/* Stats row + filter toggle */}
            <div className="mt-2.5 flex items-center justify-between">
              <div className="flex flex-wrap gap-1.5 text-[11px] text-white/40">
                <span className="rounded-full border border-white/[0.07] bg-white/[0.03] px-2 py-0.5">{projectItems.length} nodes</span>
                <span className="rounded-full border border-white/[0.07] bg-white/[0.03] px-2 py-0.5">{totalRelations} edges</span>
                <span className="rounded-full border border-white/[0.07] bg-white/[0.03] px-2 py-0.5">{visibleItems.length} visible</span>
              </div>
              <button
                type="button"
                onClick={() => setShowLayerFilter(v => !v)}
                className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] transition-all ${
                  showLayerFilter || layerFilter
                    ? "border-violet-300/35 bg-violet-500/15 text-violet-200"
                    : "border-white/[0.07] bg-white/[0.03] text-white/45 hover:bg-white/[0.07] hover:text-white/70"
                }`}
              >
                <Filter className="h-3 w-3" />
                Layer
                {layerFilter && <span className="rounded-full bg-violet-500/30 px-1 text-[9px] text-violet-200">{layerFilter.slice(0, 8)}</span>}
              </button>
            </div>

            {/* Layer filter pills */}
            <AnimatePresence>
              {showLayerFilter && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  className="mt-2.5 overflow-hidden"
                >
                  <LayerFilter
                    layers={allLayers}
                    activeLayer={layerFilter}
                    layerCounts={layerCounts}
                    onSelect={setLayerFilter}
                  />
                </motion.div>
              )}
            </AnimatePresence>
          </Panel>

          {/* ── Breadcrumb ── */}
          <AnimatePresence>
            {mode === "levels" && activeBreadcrumbItems.length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.15 }}
              >
                <Panel className="p-3">
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2 text-[11px] font-medium text-white/60">
                      <Network className="h-3.5 w-3.5" />
                      Navigation path
                    </div>
                    <button
                      type="button"
                      onClick={goBackBreadcrumb}
                      className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[11px] text-white/55 transition hover:bg-white/[0.08] hover:text-white"
                    >
                      <ArrowLeft className="h-3 w-3" />
                      Back
                    </button>
                  </div>
                  <div className="flex flex-wrap items-center gap-1">
                    {activeBreadcrumbItems.map((item, i) => (
                      <React.Fragment key={item.id}>
                        <button
                          type="button"
                          onClick={() => jumpToBreadcrumb(item.id)}
                          className={`max-w-[160px] truncate rounded-full border px-2.5 py-1 text-[11px] transition-all ${
                            item.id === selectedId
                              ? "border-violet-300/40 bg-violet-500/25 text-white font-medium"
                              : "border-white/[0.07] bg-white/[0.03] text-white/55 hover:bg-white/[0.08] hover:text-white"
                          }`}
                        >
                          {item.name}
                        </button>
                        {i < activeBreadcrumbItems.length - 1 && (
                          <ChevronRight className="h-3 w-3 text-white/20" />
                        )}
                      </React.Fragment>
                    ))}
                  </div>
                </Panel>
              </motion.div>
            )}
          </AnimatePresence>

          {/* ── Shortcuts ── */}
          <Panel className="p-3">
            <button
              type="button"
              onClick={() => setShowShortcuts(v => !v)}
              className="flex w-full items-center justify-between text-[11px]"
            >
              <div className="flex items-center gap-2 text-white/60 font-medium">
                <Keyboard className="h-3.5 w-3.5" />
                Keyboard shortcuts
              </div>
              <ChevronDown className={`h-3.5 w-3.5 text-white/30 transition-transform ${showShortcuts ? "rotate-180" : ""}`} />
            </button>
            <AnimatePresence>
              {showShortcuts && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  className="mt-2.5 overflow-hidden"
                >
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-[11px] text-white/50">
                    {[
                      ["/", "Search"], ["Esc", "Clear / deselect"],
                      ["Enter", "Drill into node"], ["Backspace", "Go back"],
                      ["1", "Flow view"], ["2", "Levels view"],
                      ["3", "Full view"], ["f", "Layer filter"],
                    ].map(([key, desc]) => (
                      <div key={key} className="flex items-center gap-2">
                        <Kbd>{key}</Kbd>
                        <span>{desc}</span>
                      </div>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </Panel>

          {/* ── Relation legend ── */}
          <Panel className="p-3">
            <p className="mb-2 text-[11px] font-medium text-white/60">Relation legend</p>
            <div className="grid gap-1.5 text-[11px] text-white/55">
              {[
                { color: relationColors.dependency, label: relationLabels.dependsOn },
                { color: relationColors.usedBy, label: relationLabels.usedBy },
                { color: relationColors.indirect, label: relationLabels.indirect },
              ].map(({ color, label }) => (
                <div key={label} className="flex items-center gap-2.5">
                  <span className="h-1.5 w-7 rounded-full" style={{ background: color }} />
                  <span>{label}</span>
                </div>
              ))}
            </div>
          </Panel>
        </div>

        {/* ── BOTTOM CONTEXTUAL BAR (selected node) ── */}
        <AnimatePresence>
          {selectedItem && (
            <motion.div
              key={selectedItem.id}
              initial={{ opacity: 0, y: 16, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 16, scale: 0.98 }}
              transition={{ duration: 0.15 }}
              className="absolute bottom-4 left-1/2 z-30 w-[min(720px,calc(100vw-2rem))] -translate-x-1/2"
            >
              <Panel className="px-4 py-3">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-center gap-3 min-w-0">
                    {(() => {
                      const style = getTypeStyle(selectedItem.type);
                      const Icon = getTypeIcon(selectedItem.type);
                      return (
                        <div className="shrink-0 rounded-xl border p-2.5" style={{ borderColor: `${style.accent}40`, background: style.background, color: style.accent }}>
                          <Icon className="h-4 w-4" />
                        </div>
                      );
                    })()}
                    <div className="min-w-0">
                      <p className="truncate text-[13px] font-semibold text-white">{selectedItem.name}</p>
                      <p className="truncate text-[11px] text-white/40">{selectedItem.layer} · {selectedItem.type} · {selectedDeps.length} deps</p>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => enterNode(selectedItem.id)}
                      className="inline-flex h-8 items-center gap-1.5 rounded-xl border border-violet-300/30 bg-violet-500/20 px-3 text-[11.5px] text-white hover:bg-violet-500/30 transition-colors"
                    >
                      Enter node <ArrowRight className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setDetailsOpen(v => !v)}
                      className="inline-flex h-8 items-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.05] px-3 text-[11.5px] text-white hover:bg-white/[0.09] transition-colors"
                    >
                      {detailsOpen ? <PanelRightClose className="h-3.5 w-3.5" /> : <PanelRightOpen className="h-3.5 w-3.5" />}
                      {detailsOpen ? "Hide" : "Details"}
                    </button>
                    <button
                      type="button"
                      onClick={clearSelection}
                      className="h-8 rounded-xl border border-white/10 bg-white/[0.05] px-3 text-[11.5px] text-white/70 hover:bg-white/[0.09] hover:text-white transition-colors"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              </Panel>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── BOTTOM RIGHT CONTROLS ── */}
        <div className="absolute bottom-20 right-4 z-30 flex flex-col gap-2 items-end">
          <button
            type="button"
            onClick={resetCurrentLayout}
            className="inline-flex h-9 items-center gap-2 rounded-2xl border border-white/10 bg-zinc-950/80 px-3 text-[11px] text-white/70 shadow-xl backdrop-blur-xl hover:bg-white/[0.07] hover:text-white transition-colors"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Reset view
          </button>
          <button
            type="button"
            onClick={resetAllLayouts}
            className="inline-flex h-9 items-center gap-2 rounded-2xl border border-white/10 bg-zinc-950/80 px-3 text-[11px] text-white/70 shadow-xl backdrop-blur-xl hover:bg-white/[0.07] hover:text-white transition-colors"
          >
            <Maximize2 className="h-3.5 w-3.5" />
            Reset all
          </button>
        </div>

        {/* ── RIGHT DETAILS PANEL ── */}
        <AnimatePresence>
          {selectedItem && detailsOpen && (
            <motion.aside
              key={selectedItem.id}
              initial={{ opacity: 0, x: 28 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 28 }}
              transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
              className="absolute right-4 top-4 z-30 h-[calc(100vh-7rem)] w-[min(400px,calc(100vw-2rem))]"
            >
              <Panel className="flex h-full flex-col overflow-hidden">
                {/* Panel header */}
                <div className="border-b border-white/[0.07] p-4">
                  {(() => {
                    const style = getTypeStyle(selectedItem.type);
                    const Icon = getTypeIcon(selectedItem.type);
                    return (
                      <div className="flex items-start gap-3">
                        <div className="rounded-2xl border p-3" style={{ borderColor: `${style.accent}44`, background: style.background, color: style.accent }}>
                          <Icon className="h-5 w-5" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="mb-2 flex flex-wrap gap-1.5">
                            <span className="rounded-full border border-white/10 bg-white/[0.05] px-2 py-0.5 text-[10.5px] text-white/60">{style.label}</span>
                            <span className="rounded-full border border-white/10 bg-white/[0.05] px-2 py-0.5 text-[10.5px] text-white/60">{selectedItem.layer ?? "Uncategorized"}</span>
                          </div>
                          <h2 className="break-words text-[18px] font-semibold leading-tight tracking-tight">{selectedItem.name}</h2>
                          <p className="mt-1 break-all text-[11px] text-white/35 font-mono">{selectedItem.path ?? selectedItem.id}</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => setDetailsOpen(false)}
                          className="rounded-xl p-1.5 text-white/35 transition hover:bg-white/10 hover:text-white"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    );
                  })()}
                  <div className="mt-3 flex gap-2">
                    <button
                      type="button"
                      onClick={() => enterNode(selectedItem.id)}
                      className="inline-flex h-9 flex-1 items-center justify-center gap-2 rounded-2xl border border-violet-300/30 bg-violet-500/20 text-[12.5px] text-white hover:bg-violet-500/30 transition-colors"
                    >
                      Enter node <ArrowRight className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={clearSelection}
                      className="h-9 rounded-2xl border border-white/10 bg-white/[0.04] px-3 text-[12.5px] text-white/70 hover:bg-white/[0.08] hover:text-white transition-colors"
                    >
                      Clear
                    </button>
                  </div>
                </div>

                {/* Panel body */}
                <div className="flex-1 space-y-5 overflow-y-auto overscroll-contain p-4">
                  {/* Description */}
                  <section>
                    <h3 className="mb-2 flex items-center gap-2 text-[12.5px] font-semibold text-white/80">
                      <Info className="h-3.5 w-3.5 text-white/40" />
                      Description
                    </h3>
                    <p className="rounded-xl border border-white/[0.07] bg-white/[0.03] p-3.5 text-[12.5px] leading-relaxed text-white/65">
                      {selectedItem.description ?? "No description provided."}
                    </p>
                  </section>

                  {/* Responsibilities */}
                  {(selectedItem.responsibilities?.length ?? 0) > 0 && (
                    <section>
                      <h3 className="mb-2 text-[12.5px] font-semibold text-white/80">Responsibilities</h3>
                      <div className="space-y-1.5">
                        {(selectedItem.responsibilities ?? []).map((r, i) => (
                          <div key={i} className="flex items-start gap-2.5 rounded-xl border border-white/[0.07] bg-white/[0.03] px-3 py-2.5">
                            <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-white/25" />
                            <p className="text-[12px] text-white/65 leading-relaxed">{r}</p>
                          </div>
                        ))}
                      </div>
                    </section>
                  )}

                  {/* Dependencies */}
                  <section>
                    <div className="mb-2 flex items-center justify-between">
                      <h3 className="text-[12.5px] font-semibold" style={{ color: relationColors.dependency }}>
                        {relationLabels.dependsOn}
                      </h3>
                      <span className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5 text-[10px] text-white/40 tabular-nums">
                        {selectedDeps.length}
                      </span>
                    </div>
                    <div className="space-y-1.5">
                      {selectedDeps.length === 0 ? (
                        <p className="rounded-xl border border-dashed border-white/[0.08] px-3 py-3 text-[12px] text-white/30">
                          No direct dependencies mapped.
                        </p>
                      ) : selectedDeps.map(item => (
                        <div
                          key={item.id}
                          className="flex items-center gap-2 rounded-xl border p-2"
                          style={{ borderColor: `${relationColors.dependency}20`, background: `${relationColors.dependency}0d` }}
                        >
                          <button
                            type="button"
                            onClick={() => selectNode(item.id)}
                            className="min-w-0 flex-1 rounded-lg px-2 py-1.5 text-left transition hover:bg-white/[0.04]"
                          >
                            <p className="truncate text-[12px] font-medium text-white/80">{item.name}</p>
                            <p className="truncate text-[11px] text-white/35">{item.path ?? item.id}</p>
                          </button>
                          <button
                            type="button"
                            onClick={() => enterNode(item.id)}
                            className="h-7 shrink-0 rounded-lg border border-white/10 bg-white/[0.05] px-2 text-[11px] text-white/65 hover:bg-white/[0.09] transition-colors"
                          >
                            Enter
                          </button>
                        </div>
                      ))}
                    </div>
                  </section>

                  {/* Used by */}
                  <section>
                    <div className="mb-2 flex items-center justify-between">
                      <h3 className="text-[12.5px] font-semibold" style={{ color: relationColors.usedBy }}>
                        {relationLabels.usedBy}
                      </h3>
                      <span className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5 text-[10px] text-white/40 tabular-nums">
                        {selectedUsedBy.length}
                      </span>
                    </div>
                    <div className="space-y-1.5">
                      {selectedUsedBy.length === 0 ? (
                        <p className="rounded-xl border border-dashed border-white/[0.08] px-3 py-3 text-[12px] text-white/30">
                          Nothing directly uses this node.
                        </p>
                      ) : selectedUsedBy.map(item => (
                        <div
                          key={item.id}
                          className="flex items-center gap-2 rounded-xl border p-2"
                          style={{ borderColor: `${relationColors.usedBy}20`, background: `${relationColors.usedBy}0d` }}
                        >
                          <button
                            type="button"
                            onClick={() => selectNode(item.id)}
                            className="min-w-0 flex-1 rounded-lg px-2 py-1.5 text-left transition hover:bg-white/[0.04]"
                          >
                            <p className="truncate text-[12px] font-medium text-white/80">{item.name}</p>
                            <p className="truncate text-[11px] text-white/35">{item.path ?? item.id}</p>
                          </button>
                          <button
                            type="button"
                            onClick={() => enterNode(item.id)}
                            className="h-7 shrink-0 rounded-lg border border-white/10 bg-white/[0.05] px-2 text-[11px] text-white/65 hover:bg-white/[0.09] transition-colors"
                          >
                            Enter
                          </button>
                        </div>
                      ))}
                    </div>
                  </section>
                </div>
              </Panel>
            </motion.aside>
          )}
        </AnimatePresence>

        {/* ── GRAPH CANVAS ── */}
        {!mounted ? (
          <div className="flex h-full items-center justify-center">
            <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-5 shadow-2xl backdrop-blur-xl">
              <Sparkles className="h-5 w-5 animate-pulse text-violet-300" />
              <span className="text-[13px] text-white/60">Rendering graph…</span>
            </div>
          </div>
        ) : (
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onPaneClick={clearSelection}
            onPaneContextMenu={e => { e.preventDefault(); clearSelection(); }}
            fitView
            fitViewOptions={{ padding: 0.22 }}
            minZoom={0.1}
            maxZoom={1.8}
            panOnScroll
            proOptions={{ hideAttribution: true }}
            defaultEdgeOptions={{ type: "smoothstep", markerEnd: { type: MarkerType.ArrowClosed } }}
          >
            <MiniMap
              pannable
              zoomable
              className="!bottom-4 !right-4 !h-32 !w-52 !rounded-2xl !border !border-white/10 !bg-zinc-950/85 !backdrop-blur-xl"
              nodeStrokeColor={() => "rgba(255,255,255,0.15)"}
              nodeColor={(node) => {
                const n = node as ProjectFlowNode;
                if (n.data?.selected) return "rgba(167,139,250,0.8)";
                if (n.data?.relation === "dependency") return `${relationColors.dependency}99`;
                if (n.data?.relation === "used-by") return `${relationColors.usedBy}99`;
                if (n.data?.muted) return "rgba(255,255,255,0.06)";
                return "rgba(255,255,255,0.14)";
              }}
              maskColor="rgba(0,0,0,0.55)"
            />
            <Controls className="[&>button]:!rounded-xl [&>button]:!border-white/10 [&>button]:!bg-zinc-950/85 [&>button]:!text-white/70 [&>button:hover]:!bg-zinc-800 [&>button:hover]:!text-white" />
            <Background variant={BackgroundVariant.Dots} gap={24} size={1.1} color="rgba(255,255,255,0.09)" />
          </ReactFlow>
        )}
      </section>
    </main>
  );
}