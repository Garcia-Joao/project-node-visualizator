"use client";

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
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
  Boxes,
  ChevronRight,
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
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

import projectItemsJson from "@/data/projectItems.json";

type ProjectItem = {
  id: string;
  name: string;
  path: string;
  type: string;
  layer: string;
  description: string;
  responsibilities: string[];
  dependsOn: string[];
};

type ViewMode = "startup-flow" | "levels" | "full-project";

type NodeRelation =
  | "selected"
  | "dependency"
  | "used-by"
  | "indirect"
  | "none";

type TypeConfig = {
  Icon: LucideIcon;
  badge: string;
  className: string;
  ringClassName: string;
  glowClassName: string;
};

type ProjectNodeData = {
  item: ProjectItem;
  selected: boolean;
  relation: NodeRelation;
  muted: boolean;
  onSelect: (id: string) => void;
  getTypeConfig: (type: string) => TypeConfig;
};

type ProjectFlowNode = Node<ProjectNodeData, "projectNode">;

const projectItems = projectItemsJson as ProjectItem[];

const START_NODE_ID = "startup";
const STORAGE_PREFIX = "handover-map-layout-v10";

const layerOrder = [
  "Application",
  "Views",
  "View / Design Canvas",
  "View / Case Properties",
  "ViewModels",
  "ViewModels / Design Canvas",
  "ViewModels / Components",
  "Models",
  "Services",
  "Factories",
  "Commands",
  "Custom Components",
  "Data Objects",
  "Utilities",
  "Resources",
];

const typeConfigMap: Record<string, TypeConfig> = {
  Bootstrap: {
    Icon: Workflow,
    badge: "Startup",
    className: "border-red-400/30 bg-red-500/10 text-red-100",
    ringClassName: "ring-red-300/50",
    glowClassName: "shadow-[0_0_42px_rgba(239,68,68,0.18)]",
  },
  View: {
    Icon: Eye,
    badge: "View",
    className: "border-sky-400/30 bg-sky-500/10 text-sky-100",
    ringClassName: "ring-sky-300/50",
    glowClassName: "shadow-[0_0_42px_rgba(14,165,233,0.18)]",
  },
  "Design View": {
    Icon: Eye,
    badge: "Design View",
    className: "border-cyan-400/30 bg-cyan-500/10 text-cyan-100",
    ringClassName: "ring-cyan-300/50",
    glowClassName: "shadow-[0_0_42px_rgba(34,211,238,0.18)]",
  },
  "Property View": {
    Icon: Eye,
    badge: "Property View",
    className: "border-blue-400/30 bg-blue-500/10 text-blue-100",
    ringClassName: "ring-blue-300/50",
    glowClassName: "shadow-[0_0_42px_rgba(59,130,246,0.18)]",
  },
  ViewModel: {
    Icon: MousePointerClick,
    badge: "VM",
    className: "border-violet-400/30 bg-violet-500/10 text-violet-100",
    ringClassName: "ring-violet-300/50",
    glowClassName: "shadow-[0_0_42px_rgba(139,92,246,0.18)]",
  },
  "Base VM": {
    Icon: MousePointerClick,
    badge: "Base VM",
    className: "border-violet-400/30 bg-violet-500/10 text-violet-100",
    ringClassName: "ring-violet-300/50",
    glowClassName: "shadow-[0_0_42px_rgba(139,92,246,0.18)]",
  },
  "State VM": {
    Icon: MousePointerClick,
    badge: "State VM",
    className: "border-fuchsia-400/30 bg-fuchsia-500/10 text-fuchsia-100",
    ringClassName: "ring-fuchsia-300/50",
    glowClassName: "shadow-[0_0_42px_rgba(217,70,239,0.18)]",
  },
  "Design VM": {
    Icon: MousePointerClick,
    badge: "Design VM",
    className: "border-fuchsia-400/30 bg-fuchsia-500/10 text-fuchsia-100",
    ringClassName: "ring-fuchsia-300/50",
    glowClassName: "shadow-[0_0_42px_rgba(217,70,239,0.18)]",
  },
  "Component VM": {
    Icon: MousePointerClick,
    badge: "Component VM",
    className: "border-purple-400/30 bg-purple-500/10 text-purple-100",
    ringClassName: "ring-purple-300/50",
    glowClassName: "shadow-[0_0_42px_rgba(168,85,247,0.18)]",
  },
  "ViewModel Group": {
    Icon: MousePointerClick,
    badge: "VM Group",
    className: "border-purple-400/30 bg-purple-500/10 text-purple-100",
    ringClassName: "ring-purple-300/50",
    glowClassName: "shadow-[0_0_42px_rgba(168,85,247,0.18)]",
  },
  Model: {
    Icon: Database,
    badge: "Model",
    className: "border-emerald-400/30 bg-emerald-500/10 text-emerald-100",
    ringClassName: "ring-emerald-300/50",
    glowClassName: "shadow-[0_0_42px_rgba(16,185,129,0.18)]",
  },
  Service: {
    Icon: Settings,
    badge: "Service",
    className: "border-amber-400/30 bg-amber-500/10 text-amber-100",
    ringClassName: "ring-amber-300/50",
    glowClassName: "shadow-[0_0_42px_rgba(245,158,11,0.18)]",
  },
  Factory: {
    Icon: Boxes,
    badge: "Factory",
    className: "border-orange-400/30 bg-orange-500/10 text-orange-100",
    ringClassName: "ring-orange-300/50",
    glowClassName: "shadow-[0_0_42px_rgba(249,115,22,0.18)]",
  },
  Command: {
    Icon: GitBranch,
    badge: "Command",
    className: "border-lime-400/30 bg-lime-500/10 text-lime-100",
    ringClassName: "ring-lime-300/50",
    glowClassName: "shadow-[0_0_42px_rgba(132,204,22,0.18)]",
  },
  Utility: {
    Icon: Settings,
    badge: "Utility",
    className: "border-teal-400/30 bg-teal-500/10 text-teal-100",
    ringClassName: "ring-teal-300/50",
    glowClassName: "shadow-[0_0_42px_rgba(20,184,166,0.18)]",
  },
  "Data Object": {
    Icon: Database,
    badge: "Data",
    className: "border-green-400/30 bg-green-500/10 text-green-100",
    ringClassName: "ring-green-300/50",
    glowClassName: "shadow-[0_0_42px_rgba(34,197,94,0.18)]",
  },
  "Custom Component": {
    Icon: Boxes,
    badge: "Component",
    className: "border-pink-400/30 bg-pink-500/10 text-pink-100",
    ringClassName: "ring-pink-300/50",
    glowClassName: "shadow-[0_0_42px_rgba(236,72,153,0.18)]",
  },
  Feature: {
    Icon: FileCode2,
    badge: "Feature",
    className: "border-indigo-400/30 bg-indigo-500/10 text-indigo-100",
    ringClassName: "ring-indigo-300/50",
    glowClassName: "shadow-[0_0_42px_rgba(99,102,241,0.18)]",
  },
  Controller: {
    Icon: Workflow,
    badge: "Controller",
    className: "border-yellow-400/30 bg-yellow-500/10 text-yellow-100",
    ringClassName: "ring-yellow-300/50",
    glowClassName: "shadow-[0_0_42px_rgba(234,179,8,0.18)]",
  },
  "Resource Group": {
    Icon: FolderTree,
    badge: "Assets",
    className: "border-zinc-400/30 bg-zinc-500/10 text-zinc-100",
    ringClassName: "ring-zinc-300/50",
    glowClassName: "shadow-[0_0_42px_rgba(161,161,170,0.16)]",
  },
};

function getTypeConfig(type: string): TypeConfig {
  return (
    typeConfigMap[type] ?? {
      Icon: FileCode2,
      badge: type,
      className: "border-white/15 bg-white/5 text-white",
      ringClassName: "ring-white/40",
      glowClassName: "shadow-[0_0_42px_rgba(255,255,255,0.10)]",
    }
  );
}

function itemById(id: string): ProjectItem | undefined {
  return projectItems.find((item) => item.id === id);
}

function buildUsedByMap(items: ProjectItem[]) {
  const usedByMap = new Map<string, string[]>();

  items.forEach((item) => {
    item.dependsOn.forEach((depId) => {
      const current = usedByMap.get(depId) ?? [];
      current.push(item.id);
      usedByMap.set(depId, current);
    });
  });

  return usedByMap;
}

function truncate(text: string, max = 90) {
  return text.length <= max ? text : `${text.slice(0, max)}...`;
}

function unique<T>(values: T[]) {
  return Array.from(new Set(values));
}

function getStorageKey(mode: ViewMode, rootId: string) {
  return `${STORAGE_PREFIX}:${mode}:${rootId}`;
}

function readSavedPositions(mode: ViewMode, rootId: string) {
  if (typeof window === "undefined") {
    return new Map<string, { x: number; y: number }>();
  }

  try {
    const raw = window.localStorage.getItem(getStorageKey(mode, rootId));
    if (!raw) return new Map<string, { x: number; y: number }>();

    const parsed = JSON.parse(raw) as Record<string, { x: number; y: number }>;
    return new Map(Object.entries(parsed));
  } catch {
    return new Map<string, { x: number; y: number }>();
  }
}

function savePositions(mode: ViewMode, rootId: string, nodes: ProjectFlowNode[]) {
  if (typeof window === "undefined") return;

  const positions: Record<string, { x: number; y: number }> = {};

  nodes.forEach((node) => {
    positions[node.id] = {
      x: node.position.x,
      y: node.position.y,
    };
  });

  window.localStorage.setItem(
    getStorageKey(mode, rootId),
    JSON.stringify(positions)
  );
}

function clearSavedPositions(mode: ViewMode, rootId: string) {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(getStorageKey(mode, rootId));
}

function clearAllSavedPositions() {
  if (typeof window === "undefined") return;

  Object.keys(window.localStorage).forEach((key) => {
    if (key.startsWith(STORAGE_PREFIX)) {
      window.localStorage.removeItem(key);
    }
  });
}

function getRelationship(
  itemId: string,
  selectedItem: ProjectItem | undefined,
  usedByMap: Map<string, string[]>
): NodeRelation {
  if (!selectedItem) return "none";
  if (itemId === selectedItem.id) return "selected";
  if (selectedItem.dependsOn.includes(itemId)) return "dependency";
  if ((usedByMap.get(selectedItem.id) ?? []).includes(itemId)) return "used-by";

  const secondLevel = new Set<string>();

  selectedItem.dependsOn.forEach((depId) => {
    const dep = itemById(depId);
    dep?.dependsOn.forEach((nextId) => secondLevel.add(nextId));
  });

  (usedByMap.get(selectedItem.id) ?? []).forEach((userId) => {
    const user = itemById(userId);
    user?.dependsOn.forEach((nextId) => secondLevel.add(nextId));
  });

  return secondLevel.has(itemId) ? "indirect" : "none";
}

function matchesQuery(item: ProjectItem, query: string) {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) return true;

  return [
    item.name,
    item.path,
    item.type,
    item.layer,
    item.description,
    ...item.responsibilities,
  ]
    .join(" ")
    .toLowerCase()
    .includes(normalizedQuery);
}

function getVisibleItems(
  mode: ViewMode,
  selectedItem: ProjectItem | undefined,
  usedByMap: Map<string, string[]>,
  query: string
) {
  if (mode === "full-project") {
    return projectItems.filter((item) => matchesQuery(item, query));
  }

  const root = selectedItem ?? itemById(START_NODE_ID) ?? projectItems[0];

  if (mode === "startup-flow") {
    const ids = new Set<string>([
      "app",
      START_NODE_ID,
      root.id,
      ...root.dependsOn,
      ...(usedByMap.get(root.id) ?? []),
    ]);

    root.dependsOn.forEach((depId) => {
      const dep = itemById(depId);
      dep?.dependsOn.forEach((nextId) => ids.add(nextId));
    });

    (usedByMap.get(root.id) ?? []).forEach((userId) => {
      const user = itemById(userId);
      user?.dependsOn.forEach((nextId) => ids.add(nextId));
    });

    return projectItems.filter(
      (item) => ids.has(item.id) && matchesQuery(item, query)
    );
  }

  const ids = new Set<string>([
    root.id,
    ...root.dependsOn,
    ...(usedByMap.get(root.id) ?? []),
  ]);

  root.dependsOn.forEach((depId) => {
    const dep = itemById(depId);
    dep?.dependsOn.forEach((nextId) => ids.add(nextId));
  });

  (usedByMap.get(root.id) ?? []).forEach((userId) => {
    const user = itemById(userId);
    user?.dependsOn.forEach((nextId) => ids.add(nextId));
  });

  return projectItems.filter(
    (item) => ids.has(item.id) && matchesQuery(item, query)
  );
}

function applySavedPositions(
  mode: ViewMode,
  rootId: string,
  nodes: ProjectFlowNode[]
) {
  const savedPositions = readSavedPositions(mode, rootId);

  return nodes.map((node) => {
    const saved = savedPositions.get(node.id);
    if (!saved) return node;

    return {
      ...node,
      position: saved,
    };
  });
}


function hasSavedPositions(mode: ViewMode, rootId: string) {
  return readSavedPositions(mode, rootId).size > 0;
}

type NodeBounds = {
  x: number;
  y: number;
  width: number;
  height: number;
};

const DEFAULT_NODE_WIDTH = 320;
const DEFAULT_NODE_HEIGHT = 180;
const DEFAULT_NODE_GAP = 36;

function getNodeBounds(node: ProjectFlowNode): NodeBounds {
  return {
    x: node.position.x,
    y: node.position.y,
    width: DEFAULT_NODE_WIDTH,
    height: DEFAULT_NODE_HEIGHT,
  };
}

function boundsOverlap(a: NodeBounds, b: NodeBounds) {
  return !(
    a.x + a.width + DEFAULT_NODE_GAP <= b.x ||
    b.x + b.width + DEFAULT_NODE_GAP <= a.x ||
    a.y + a.height + DEFAULT_NODE_GAP <= b.y ||
    b.y + b.height + DEFAULT_NODE_GAP <= a.y
  );
}

function collidesWithPlacedNodes(node: ProjectFlowNode, placedNodes: ProjectFlowNode[]) {
  const nodeBounds = getNodeBounds(node);

  return placedNodes.some((placedNode) =>
    boundsOverlap(nodeBounds, getNodeBounds(placedNode))
  );
}

function findNonOverlappingPosition(
  node: ProjectFlowNode,
  placedNodes: ProjectFlowNode[]
) {
  if (!collidesWithPlacedNodes(node, placedNodes)) {
    return node.position;
  }

  const origin = node.position;
  const horizontalStep = DEFAULT_NODE_WIDTH + 90;
  const verticalStep = DEFAULT_NODE_HEIGHT + 70;
  const maxAttempts = 96;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const ring = Math.ceil(attempt / 8);
    const slot = attempt % 8;

    const offsets = [
      { x: horizontalStep * ring, y: 0 },
      { x: -horizontalStep * ring, y: 0 },
      { x: 0, y: verticalStep * ring },
      { x: 0, y: -verticalStep * ring },
      { x: horizontalStep * ring, y: verticalStep * ring },
      { x: horizontalStep * ring, y: -verticalStep * ring },
      { x: -horizontalStep * ring, y: verticalStep * ring },
      { x: -horizontalStep * ring, y: -verticalStep * ring },
    ];

    const offset = offsets[slot];

    const candidateNode: ProjectFlowNode = {
      ...node,
      position: {
        x: origin.x + offset.x,
        y: origin.y + offset.y,
      },
    };

    if (!collidesWithPlacedNodes(candidateNode, placedNodes)) {
      return candidateNode.position;
    }
  }

  return {
    x: origin.x,
    y: origin.y + (placedNodes.length + 1) * verticalStep,
  };
}

function preventInitialNodeOverlaps(nodes: ProjectFlowNode[]) {
  const placedNodes: ProjectFlowNode[] = [];

  return nodes.map((node) => {
    const position = findNonOverlappingPosition(node, placedNodes);

    const nextNode: ProjectFlowNode = {
      ...node,
      position,
    };

    placedNodes.push(nextNode);
    return nextNode;
  });
}

function createProjectNode(
  item: ProjectItem,
  position: { x: number; y: number },
  selectedItem: ProjectItem | undefined,
  usedByMap: Map<string, string[]>,
  onSelect: (id: string) => void
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
      item,
      selected: selectedItem?.id === item.id,
      relation,
      muted: hasContext && relation === "none",
      onSelect,
      getTypeConfig,
    },
  };
}

function buildFullProjectNodes(
  items: ProjectItem[],
  selectedItem: ProjectItem | undefined,
  usedByMap: Map<string, string[]>,
  onSelect: (id: string) => void
): ProjectFlowNode[] {
  const layers = unique(
    layerOrder.filter((layer) => items.some((item) => item.layer === layer))
  );

  const result: ProjectFlowNode[] = [];

  layers.forEach((layer, layerIndex) => {
    const layerItems = items.filter((item) => item.layer === layer);
    const radius = 280 + layerIndex * 270;
    const angleOffset = layerIndex * 0.31;

    layerItems.forEach((item, itemIndex) => {
      const angle =
        angleOffset +
        (Math.PI * 2 * itemIndex) / Math.max(layerItems.length, 1);

      result.push(
        createProjectNode(
          item,
          {
            x: Math.cos(angle) * radius,
            y: Math.sin(angle) * radius,
          },
          selectedItem,
          usedByMap,
          onSelect
        )
      );
    });
  });

  return result;
}

function buildLevelsNodes(
  items: ProjectItem[],
  selectedItem: ProjectItem | undefined,
  usedByMap: Map<string, string[]>,
  onSelect: (id: string) => void
): ProjectFlowNode[] {
  const root = selectedItem ?? itemById(START_NODE_ID) ?? projectItems[0];
  const positions = new Map<string, { x: number; y: number }>();

  const leftItems = (usedByMap.get(root.id) ?? [])
    .map(itemById)
    .filter((item): item is ProjectItem => Boolean(item))
    .filter((item) => items.some((visible) => visible.id === item.id));

  const rightItems = root.dependsOn
    .map(itemById)
    .filter((item): item is ProjectItem => Boolean(item))
    .filter((item) => items.some((visible) => visible.id === item.id));

  positions.set(root.id, { x: 0, y: 0 });

  leftItems.forEach((item, index) => {
    const offset = (index - (leftItems.length - 1) / 2) * 220;
    positions.set(item.id, { x: -520, y: offset });
  });

  rightItems.forEach((item, index) => {
    const offset = (index - (rightItems.length - 1) / 2) * 220;
    positions.set(item.id, { x: 520, y: offset });
  });

  const secondLevel = new Set<string>();

  rightItems.forEach((item) => {
    item.dependsOn.forEach((depId) => secondLevel.add(depId));
  });

  leftItems.forEach((item) => {
    (usedByMap.get(item.id) ?? []).forEach((userId) => secondLevel.add(userId));
  });

  const secondItems = Array.from(secondLevel)
    .map(itemById)
    .filter((item): item is ProjectItem => {
      if (!item) return false;
      if (!items.some((visible) => visible.id === item.id)) return false;
      return !positions.has(item.id);
    });

  secondItems.forEach((item, index) => {
    const isRightSide = rightItems.some((rightItem) =>
      rightItem.dependsOn.includes(item.id)
    );

    const offset = (index - (secondItems.length - 1) / 2) * 205;
    positions.set(item.id, {
      x: isRightSide ? 940 : -940,
      y: offset,
    });
  });

  return items.map((item, index) =>
    createProjectNode(
      item,
      positions.get(item.id) ?? {
        x: 0,
        y: 320 + index * 180,
      },
      root,
      usedByMap,
      onSelect
    )
  );
}

function buildStartupFlowNodes(
  items: ProjectItem[],
  selectedItem: ProjectItem | undefined,
  usedByMap: Map<string, string[]>,
  onSelect: (id: string) => void
): ProjectFlowNode[] {
  const root = selectedItem ?? itemById(START_NODE_ID) ?? projectItems[0];
  const positions = new Map<string, { x: number; y: number }>();

  const columns: string[][] = [
    ["app"],
    [START_NODE_ID],
    [
      "vm-factory",
      "main-window",
      "main-vm",
      "splash-view",
      "splash-vm",
      "splash-model",
    ],
    ["case-manager-view", "case-design-view", "case-manager-vm", "case-design-vm"],
    [
      "case-properties-view",
      "case-builder-view",
      "design-canvas-view",
      "blocks-container-view",
    ],
    [
      "properties-visualization-view",
      "canvas-block-view",
      "block-connector-view",
      "connection-line-view",
    ],
    ["case-manager-model", "case-design-model", "recent-cases-manager", "dialog-service"],
    [
      "delegate-command",
      "observable-vm",
      "viewmodel-base",
      "canvas-helper",
      "tree-helper",
      "notification-helper",
    ],
    ["resources", "custom-modals", "modal-vms", "tree-objects", "variable-vms"],
  ];

  columns.forEach((column, columnIndex) => {
    const visibleColumnItems = column
      .map(itemById)
      .filter((item): item is ProjectItem => Boolean(item))
      .filter((item) => items.some((visible) => visible.id === item.id));

    visibleColumnItems.forEach((item, itemIndex) => {
      positions.set(item.id, {
        x: columnIndex * 410,
        y: (itemIndex - (visibleColumnItems.length - 1) / 2) * 215,
      });
    });
  });

  items.forEach((item) => {
    if (positions.has(item.id)) return;

    const layerIndex = Math.max(layerOrder.indexOf(item.layer), 0);
    const sameLayerIndex = items
      .filter((candidate) => candidate.layer === item.layer)
      .findIndex((candidate) => candidate.id === item.id);

    positions.set(item.id, {
      x: 390 + layerIndex * 310,
      y: 560 + sameLayerIndex * 190,
    });
  });

  return items.map((item) =>
    createProjectNode(
      item,
      positions.get(item.id) ?? { x: 0, y: 0 },
      root,
      usedByMap,
      onSelect
    )
  );
}

function buildEdges(
  visibleItems: ProjectItem[],
  selectedItem: ProjectItem | undefined,
  usedByMap: Map<string, string[]>
): Edge[] {
  const visibleIds = new Set(visibleItems.map((item) => item.id));
  const edges: Edge[] = [];
  const selectedNodeId = selectedItem?.id;
  const selectedDependsOn = selectedItem?.dependsOn ?? [];
  const selectedUsedBy = selectedNodeId ? usedByMap.get(selectedNodeId) ?? [] : [];

  visibleItems.forEach((item) => {
    item.dependsOn.forEach((depId) => {
      if (!visibleIds.has(depId)) return;

      const hasSelectedNode = typeof selectedNodeId === "string";

      const isDependencyEdge =
        hasSelectedNode &&
        selectedNodeId === item.id &&
        selectedDependsOn.includes(depId);

      const isUsedByEdge =
        hasSelectedNode &&
        item.dependsOn.includes(selectedNodeId) &&
        depId === selectedNodeId;

      const isHighlighted =
        isDependencyEdge ||
        isUsedByEdge ||
        (hasSelectedNode && selectedNodeId === item.id) ||
        (hasSelectedNode && selectedNodeId === depId) ||
        selectedUsedBy.includes(item.id);

      let stroke = "rgba(255,255,255,0.15)";
      let strokeWidth = 2.4;

      if (isDependencyEdge) {
        stroke = "rgba(56,189,248,0.92)";
        strokeWidth = 4.4;
      } else if (isUsedByEdge) {
        stroke = "rgba(251,191,36,0.92)";
        strokeWidth = 4.4;
      } else if (isHighlighted) {
        stroke = "rgba(167,139,250,0.68)";
        strokeWidth = 3.3;
      }

      edges.push({
        id: `${item.id}->${depId}`,
        source: item.id,
        target: depId,
        type: "smoothstep",
        animated: isHighlighted,
        markerEnd: {
          type: MarkerType.ArrowClosed,
          width: 22,
          height: 22,
        },
        style: {
          stroke,
          strokeWidth,
        },
      });
    });
  });

  return edges;
}

function relationClasses(relation: NodeRelation, selected: boolean, muted: boolean) {
  if (selected) return "ring-2 ring-white/80 opacity-100 scale-[1.02]";
  if (relation === "dependency") return "ring-2 ring-sky-300/55 opacity-100";
  if (relation === "used-by") return "ring-2 ring-amber-300/55 opacity-100";
  if (relation === "indirect") return "ring-1 ring-violet-300/45 opacity-90";
  if (muted) return "opacity-35 hover:opacity-80";
  return "opacity-100";
}

function RelationBadge({ relation }: { relation: NodeRelation }) {
  if (relation === "dependency") {
    return (
      <span className="rounded-full border border-sky-400/30 bg-sky-500/15 px-2 py-0.5 text-[10px] text-sky-100">
        depends on
      </span>
    );
  }

  if (relation === "used-by") {
    return (
      <span className="rounded-full border border-amber-400/30 bg-amber-500/15 px-2 py-0.5 text-[10px] text-amber-100">
        used by
      </span>
    );
  }

  if (relation === "indirect") {
    return (
      <span className="rounded-full border border-violet-400/30 bg-violet-500/15 px-2 py-0.5 text-[10px] text-violet-100">
        indirect
      </span>
    );
  }

  return null;
}

function ProjectNode({ data }: NodeProps<ProjectFlowNode>) {
  const { item, selected, relation, muted, onSelect, getTypeConfig } = data;
  const config = getTypeConfig(item.type);
  const Icon = config.Icon;

  return (
    <div className="relative">
      <Handle
        type="target"
        position={Position.Left}
        className="!h-3 !w-3 !border !border-white/20 !bg-zinc-950"
      />

      <motion.button
        whileHover={{ scale: 1.015, y: -1 }}
        whileTap={{ scale: 0.99 }}
        onClick={(event) => {
          event.stopPropagation();
          onSelect(item.id);
        }}
        onDoubleClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
        }}
        className={`group w-[292px] rounded-[1.35rem] border p-4 text-left backdrop-blur-2xl transition-all duration-200 ${config.className} ${config.glowClassName} ${relationClasses(
          relation,
          selected,
          muted
        )}`}
      >
        <div className="mb-3 flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <div className="rounded-2xl border border-white/10 bg-black/25 p-2.5">
              <Icon className="h-4 w-4" />
            </div>

            <div className="min-w-0">
              <div className="truncate text-sm font-semibold text-white">
                {item.name}
              </div>
              <div className="mt-0.5 truncate text-[11px] text-white/45">
                {item.layer}
              </div>
            </div>
          </div>

          <div className="flex shrink-0 flex-col items-end gap-1">
            <span className="rounded-full border border-white/10 bg-black/20 px-2.5 py-1 text-[10px] font-medium text-white/75">
              {config.badge}
            </span>
            <RelationBadge relation={relation} />
          </div>
        </div>

        <div className="space-y-2">
          <div className="truncate text-[11px] text-white/50">{item.path}</div>
          <p className="text-xs leading-relaxed text-white/72">
            {truncate(item.description, 96)}
          </p>
        </div>

        <div className="mt-4 flex items-center justify-between border-t border-white/10 pt-3 text-[11px] text-white/50">
          <span>{item.dependsOn.length} dependency(s)</span>
          <span className="text-white/55">drag to organize</span>
        </div>
      </motion.button>

      <Handle
        type="source"
        position={Position.Right}
        className="!h-3 !w-3 !border !border-white/20 !bg-zinc-950"
      />
    </div>
  );
}

const nodeTypes = {
  projectNode: ProjectNode,
};

function FloatingPanel({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-[1.65rem] border border-white/10 bg-zinc-950/72 text-white shadow-2xl shadow-black/35 backdrop-blur-2xl ${className}`}
    >
      {children}
    </div>
  );
}

function modeLabel(mode: ViewMode) {
  if (mode === "startup-flow") return "Startup flow";
  if (mode === "levels") return "Levels";
  return "Full project";
}

export default function Page() {
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  const [mounted, setMounted] = useState(false);
  const [query, setQuery] = useState("");
  const [mode, setMode] = useState<ViewMode>("startup-flow");
  const [selectedId, setSelectedId] = useState<string | null>(START_NODE_ID);
  const [breadcrumb, setBreadcrumb] = useState<string[]>([START_NODE_ID]);
  const [detailsOpen, setDetailsOpen] = useState(true);

  const [nodes, setNodes, onNodesChange] = useNodesState<ProjectFlowNode>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);

  const usedByMap = useMemo(() => buildUsedByMap(projectItems), []);

  const selectedItem = useMemo(() => {
    if (!selectedId) return undefined;
    return itemById(selectedId);
  }, [selectedId]);

  const rootId = selectedId ?? START_NODE_ID;

  const visibleItems = useMemo(() => {
    return getVisibleItems(mode, selectedItem, usedByMap, query);
  }, [mode, query, selectedItem, usedByMap]);

  const searchResults = useMemo(() => {
    const normalized = query.trim();
    if (!normalized) return [];

    return projectItems
      .filter((item) => matchesQuery(item, query))
      .slice(0, 8);
  }, [query]);

  const selectedDependencies = useMemo(() => {
    if (!selectedItem) return [];

    return selectedItem.dependsOn
      .map(itemById)
      .filter((item): item is ProjectItem => Boolean(item));
  }, [selectedItem]);

  const selectedUsedBy = useMemo(() => {
    if (!selectedItem) return [];

    return (usedByMap.get(selectedItem.id) ?? [])
      .map(itemById)
      .filter((item): item is ProjectItem => Boolean(item));
  }, [selectedItem, usedByMap]);

  const totalRelations = useMemo(() => {
    return projectItems.reduce((sum, item) => sum + item.dependsOn.length, 0);
  }, []);

  const selectNode = useCallback((id: string) => {
    setSelectedId(id);
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedId(null);
  }, []);

  const enterNode = useCallback((id: string) => {
    setSelectedId(id);
    setDetailsOpen(true);
    setMode("levels");
    setBreadcrumb((current) => {
      const existingIndex = current.indexOf(id);

      if (existingIndex >= 0) {
        return current.slice(0, existingIndex + 1);
      }

      return [...current, id];
    });
  }, []);

  const jumpToBreadcrumb = useCallback((id: string) => {
    setSelectedId(id);
    setDetailsOpen(true);
    setMode("levels");
    setBreadcrumb((current) => {
      const index = current.indexOf(id);
      return index >= 0 ? current.slice(0, index + 1) : [START_NODE_ID, id];
    });
  }, []);

  const goBackBreadcrumb = useCallback(() => {
    setBreadcrumb((current) => {
      if (current.length <= 1) {
        setSelectedId(START_NODE_ID);
        return [START_NODE_ID];
      }

      const next = current.slice(0, -1);
      setSelectedId(next[next.length - 1] ?? START_NODE_ID);
      return next;
    });

    setMode("levels");
  }, []);

  const jumpToSearchResult = useCallback((id: string) => {
    setSelectedId(id);
    setDetailsOpen(true);
    setMode("levels");
    setBreadcrumb((current) => {
      if (current.includes(id)) {
        const index = current.indexOf(id);
        return current.slice(0, index + 1);
      }

      return [...current, id];
    });
  }, []);

  const resetToStartup = useCallback(() => {
    setSelectedId(START_NODE_ID);
    setDetailsOpen(true);
    setMode("startup-flow");
    setBreadcrumb([START_NODE_ID]);
    setQuery("");
  }, []);

  const resetCurrentLayout = useCallback(() => {
    clearSavedPositions(mode, rootId);
    window.location.reload();
  }, [mode, rootId]);

  const resetAllLayouts = useCallback(() => {
    clearAllSavedPositions();
    window.location.reload();
  }, []);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;

    const root = selectedItem ?? itemById(START_NODE_ID) ?? projectItems[0];

    let nextNodes: ProjectFlowNode[];

    if (mode === "full-project") {
      nextNodes = buildFullProjectNodes(
        visibleItems,
        selectedItem,
        usedByMap,
        selectNode
      );
    } else if (mode === "levels") {
      nextNodes = buildLevelsNodes(visibleItems, root, usedByMap, selectNode);
    } else {
      nextNodes = buildStartupFlowNodes(
        visibleItems,
        root,
        usedByMap,
        selectNode
      );
    }

    const nextEdges = buildEdges(visibleItems, selectedItem, usedByMap);
    const layoutNodes = hasSavedPositions(mode, root.id)
      ? nextNodes
      : preventInitialNodeOverlaps(nextNodes);
    const nodesWithSavedPositions = applySavedPositions(mode, root.id, layoutNodes);

    setNodes(nodesWithSavedPositions);
    setEdges(nextEdges);
  }, [
    mode,
    mounted,
    query,
    selectNode,
    selectedItem,
    setEdges,
    setNodes,
    usedByMap,
    visibleItems,
  ]);

  useEffect(() => {
    if (!mounted || nodes.length === 0) return;
    savePositions(mode, rootId, nodes);
  }, [mode, mounted, nodes, rootId]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const isTyping =
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        Boolean(target?.isContentEditable);

      if (event.key === "/" && !isTyping) {
        event.preventDefault();
        searchInputRef.current?.focus();
        return;
      }

      if (event.key === "Escape") {
        event.preventDefault();

        if (query) {
          setQuery("");
          return;
        }

        clearSelection();
        return;
      }

      if (isTyping) return;

      if (event.key === "Enter") {
        event.preventDefault();

        if (!selectedId) return;

        enterNode(selectedId);
        return;
      }

      if (event.key === "Backspace") {
        event.preventDefault();
        goBackBreadcrumb();
        return;
      }

      if (event.key === "1") {
        setMode("startup-flow");
        return;
      }

      if (event.key === "2") {
        setMode("levels");
        return;
      }

      if (event.key === "3") {
        setMode("full-project");
        return;
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    clearSelection,
    enterNode,
    goBackBreadcrumb,
    query,
    selectedId,
    setMode,
  ]);

  const activeBreadcrumbItems = breadcrumb
    .map(itemById)
    .filter((item): item is ProjectItem => Boolean(item));

  return (
    <main className="relative h-screen overflow-hidden bg-[#050509] text-white antialiased">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_12%_12%,rgba(59,130,246,0.16),transparent_24%),radial-gradient(circle_at_82%_20%,rgba(168,85,247,0.14),transparent_27%),radial-gradient(circle_at_52%_90%,rgba(16,185,129,0.10),transparent_28%)]" />
      <div className="pointer-events-none absolute inset-0 opacity-40 [background-image:linear-gradient(rgba(255,255,255,0.035)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.035)_1px,transparent_1px)] [background-size:56px_56px]" />

      <section className="relative h-full w-full">
        <div className="absolute left-4 top-4 z-30 w-[min(500px,calc(100vw-2rem))] space-y-3">
          <FloatingPanel className="p-4">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <div className="mb-1 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] text-white/70">
                  <Sparkles className="h-3.5 w-3.5" />
                  handover-map
                </div>
                <h1 className="text-xl font-semibold tracking-tight">
                  Project architecture map
                </h1>
                <p className="mt-1 text-xs leading-relaxed text-white/50">
                  Select with one click. Use Enter node to drill down. Drag nodes to organize.
                </p>
              </div>

              <Button
                type="button"
                onClick={resetToStartup}
                className="h-9 rounded-xl border border-white/10 bg-white/5 px-3 text-xs text-white hover:bg-white/10"
              >
                <LocateFixed className="mr-2 h-3.5 w-3.5" />
                Startup
              </Button>
            </div>

            <div className="grid gap-2">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/35" />
                <input
                  ref={searchInputRef}
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search node, layer, type, path... Press /"
                  className="h-11 w-full rounded-2xl border border-white/10 bg-black/30 pl-10 pr-10 text-sm text-white outline-none transition placeholder:text-white/30 focus:border-white/25"
                />

                {query && (
                  <button
                    type="button"
                    onClick={() => setQuery("")}
                    className="absolute right-3 top-1/2 -translate-y-1/2 rounded-lg p-1 text-white/45 hover:bg-white/10 hover:text-white"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>

              <AnimatePresence>
                {searchResults.length > 0 && (
                  <motion.div
                    initial={{ opacity: 0, y: -6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -6 }}
                    className="max-h-72 overflow-y-auto rounded-2xl border border-white/10 bg-black/30 p-2"
                  >
                    {searchResults.map((item) => {
                      const config = getTypeConfig(item.type);
                      const Icon = config.Icon;

                      return (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => jumpToSearchResult(item.id)}
                          className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left transition hover:bg-white/10"
                        >
                          <div className={`rounded-xl border p-2 ${config.className}`}>
                            <Icon className="h-3.5 w-3.5" />
                          </div>

                          <div className="min-w-0 flex-1">
                            <div className="truncate text-sm font-medium text-white/85">
                              {item.name}
                            </div>
                            <div className="truncate text-xs text-white/40">
                              {item.path}
                            </div>
                          </div>

                          <ArrowRight className="h-4 w-4 text-white/35" />
                        </button>
                      );
                    })}
                  </motion.div>
                )}
              </AnimatePresence>

              <div className="grid grid-cols-3 gap-2">
                {(["startup-flow", "levels", "full-project"] as ViewMode[]).map(
                  (viewMode) => (
                    <Button
                      key={viewMode}
                      type="button"
                      onClick={() => {
                        setMode(viewMode);
                        if (viewMode === "startup-flow" && !selectedId) {
                          setSelectedId(START_NODE_ID);
                        }
                      }}
                      className={`h-10 rounded-xl border px-3 text-xs ${
                        mode === viewMode
                          ? "border-violet-300/40 bg-violet-500/25 text-white hover:bg-violet-500/30"
                          : "border-white/10 bg-white/5 text-white/70 hover:bg-white/10 hover:text-white"
                      }`}
                    >
                      {viewMode === "startup-flow" && (
                        <Workflow className="mr-1.5 h-3.5 w-3.5" />
                      )}
                      {viewMode === "levels" && (
                        <Layers3 className="mr-1.5 h-3.5 w-3.5" />
                      )}
                      {viewMode === "full-project" && (
                        <Compass className="mr-1.5 h-3.5 w-3.5" />
                      )}
                      {modeLabel(viewMode)}
                    </Button>
                  )
                )}
              </div>

              <div className="flex flex-wrap gap-2 pt-1 text-[11px] text-white/55">
                <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1">
                  {projectItems.length} nodes
                </span>
                <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1">
                  {totalRelations} connections
                </span>
                <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1">
                  {visibleItems.length} visible
                </span>
                <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1">
                  {selectedItem ? selectedItem.name : "Nothing selected"}
                </span>
              </div>
            </div>
          </FloatingPanel>

          <AnimatePresence>
            {mode === "levels" && activeBreadcrumbItems.length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
              >
                <FloatingPanel className="p-3">
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2 text-xs font-medium text-white/75">
                      <Network className="h-3.5 w-3.5" />
                      Breadcrumb
                    </div>

                    <button
                      type="button"
                      onClick={goBackBreadcrumb}
                      className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] text-white/60 transition hover:bg-white/10 hover:text-white"
                    >
                      <ArrowLeft className="h-3 w-3" />
                      Back
                    </button>
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5">
                    {activeBreadcrumbItems.map((item, index) => (
                      <React.Fragment key={item.id}>
                        <button
                          type="button"
                          onClick={() => jumpToBreadcrumb(item.id)}
                          className={`max-w-[180px] truncate rounded-full border px-3 py-1.5 text-xs transition ${
                            item.id === selectedId
                              ? "border-violet-300/40 bg-violet-500/25 text-white"
                              : "border-white/10 bg-white/5 text-white/65 hover:bg-white/10 hover:text-white"
                          }`}
                        >
                          {item.name}
                        </button>

                        {index < activeBreadcrumbItems.length - 1 && (
                          <ChevronRight className="h-3.5 w-3.5 text-white/30" />
                        )}
                      </React.Fragment>
                    ))}
                  </div>
                </FloatingPanel>
              </motion.div>
            )}
          </AnimatePresence>

          <FloatingPanel className="p-3">
            <div className="mb-2 text-xs font-medium text-white/80">
              Relationship direction
            </div>

            <div className="grid gap-1.5 text-[11px] text-white/60">
              <div className="flex items-center gap-2">
                <span className="h-1.5 w-8 rounded-full bg-sky-400" />
                <span>Selected node depends on this</span>
              </div>

              <div className="flex items-center gap-2">
                <span className="h-1.5 w-8 rounded-full bg-amber-400" />
                <span>This node uses the selected node</span>
              </div>

              <div className="flex items-center gap-2">
                <span className="h-1.5 w-8 rounded-full bg-violet-400" />
                <span>Indirect related path</span>
              </div>
            </div>
          </FloatingPanel>
        </div>

        <AnimatePresence>
          {selectedItem && (
            <motion.div
              key={selectedItem.id}
              initial={{ opacity: 0, y: 14, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 14, scale: 0.98 }}
              className="absolute bottom-4 left-1/2 z-30 w-[min(760px,calc(100vw-2rem))] -translate-x-1/2"
            >
              <FloatingPanel className="p-3">
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <div className="min-w-0">
                    <div className="mb-1 text-[11px] text-white/45">
                      Selected node
                    </div>
                    <div className="truncate text-sm font-semibold text-white">
                      {selectedItem.name}
                    </div>
                    <div className="truncate text-xs text-white/45">
                      {selectedItem.path}
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      onClick={() => enterNode(selectedItem.id)}
                      className="h-9 rounded-xl border border-violet-300/30 bg-violet-500/20 px-3 text-xs text-white hover:bg-violet-500/30"
                    >
                      Enter node
                      <ArrowRight className="ml-2 h-3.5 w-3.5" />
                    </Button>

                    <Button
                      type="button"
                      onClick={() => setDetailsOpen((value) => !value)}
                      className="h-9 rounded-xl border border-white/10 bg-white/5 px-3 text-xs text-white hover:bg-white/10"
                    >
                      {detailsOpen ? (
                        <PanelRightClose className="mr-2 h-3.5 w-3.5" />
                      ) : (
                        <PanelRightOpen className="mr-2 h-3.5 w-3.5" />
                      )}
                      {detailsOpen ? "Hide details" : "Show details"}
                    </Button>

                    <Button
                      type="button"
                      onClick={clearSelection}
                      className="h-9 rounded-xl border border-white/10 bg-white/5 px-3 text-xs text-white hover:bg-white/10"
                    >
                      Clear
                    </Button>
                  </div>
                </div>
              </FloatingPanel>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="absolute bottom-4 right-4 z-30 flex flex-wrap justify-end gap-2 pr-60">
          <Button
            type="button"
            onClick={resetCurrentLayout}
            className="h-10 rounded-2xl border border-white/10 bg-zinc-950/75 px-3 text-xs text-white shadow-2xl backdrop-blur-xl hover:bg-white/10"
          >
            <RotateCcw className="mr-2 h-3.5 w-3.5" />
            Reset view layout
          </Button>

          <Button
            type="button"
            onClick={resetAllLayouts}
            className="h-10 rounded-2xl border border-white/10 bg-zinc-950/75 px-3 text-xs text-white shadow-2xl backdrop-blur-xl hover:bg-white/10"
          >
            <Maximize2 className="mr-2 h-3.5 w-3.5" />
            Reset all layouts
          </Button>
        </div>

        <AnimatePresence>
          {selectedItem && detailsOpen && (
            <motion.aside
              key={selectedItem.id}
              initial={{ opacity: 0, x: 24 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 24 }}
              transition={{ duration: 0.18 }}
              className="absolute right-4 top-4 z-30 h-[calc(100vh-7.5rem)] w-[min(430px,calc(100vw-2rem))]"
            >
              <FloatingPanel className="h-full overflow-hidden">
                <div className="flex h-full flex-col">
                  <div className="border-b border-white/10 p-5">
                    {(() => {
                      const config = getTypeConfig(selectedItem.type);
                      const Icon = config.Icon;

                      return (
                        <div className="flex items-start gap-3">
                          <div className={`rounded-2xl border p-3 ${config.className}`}>
                            <Icon className="h-5 w-5" />
                          </div>

                          <div className="min-w-0 flex-1">
                            <div className="mb-2 flex flex-wrap gap-2">
                              <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] text-white/65">
                                {config.badge}
                              </span>
                              <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] text-white/65">
                                {selectedItem.layer}
                              </span>
                            </div>

                            <h2 className="break-words text-xl font-semibold tracking-tight">
                              {selectedItem.name}
                            </h2>
                            <p className="mt-1 break-all text-xs text-white/45">
                              {selectedItem.path}
                            </p>
                          </div>

                          <button
                            type="button"
                            onClick={() => setDetailsOpen(false)}
                            className="rounded-xl p-2 text-white/45 transition hover:bg-white/10 hover:text-white"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </div>
                      );
                    })()}

                    <div className="mt-4 flex gap-2">
                      <Button
                        type="button"
                        onClick={() => enterNode(selectedItem.id)}
                        className="h-10 flex-1 rounded-2xl border border-violet-300/30 bg-violet-500/20 text-sm text-white hover:bg-violet-500/30"
                      >
                        Enter node
                        <ArrowRight className="ml-2 h-4 w-4" />
                      </Button>

                      <Button
                        type="button"
                        onClick={clearSelection}
                        className="h-10 rounded-2xl border border-white/10 bg-white/5 px-3 text-sm text-white hover:bg-white/10"
                      >
                        Clear
                      </Button>
                    </div>
                  </div>

                  <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-5">
                    <section>
                      <h3 className="mb-2 text-sm font-semibold text-white/90">
                        Short documentation
                      </h3>
                      <p className="rounded-2xl border border-white/10 bg-white/[0.035] p-4 text-sm leading-relaxed text-white/72">
                        {selectedItem.description}
                      </p>
                    </section>

                    <section>
                      <h3 className="mb-2 text-sm font-semibold text-white/90">
                        Responsibilities
                      </h3>
                      <div className="space-y-2">
                        {selectedItem.responsibilities.map((responsibility) => (
                          <div
                            key={responsibility}
                            className="rounded-2xl border border-white/10 bg-white/[0.035] px-3 py-2.5 text-sm text-white/70"
                          >
                            {responsibility}
                          </div>
                        ))}
                      </div>
                    </section>

                    <section>
                      <div className="mb-2 flex items-center justify-between">
                        <h3 className="text-sm font-semibold text-sky-100">
                          Depends on
                        </h3>
                        <span className="text-xs text-white/40">
                          {selectedDependencies.length}
                        </span>
                      </div>

                      <div className="space-y-2">
                        {selectedDependencies.length === 0 ? (
                          <div className="rounded-2xl border border-dashed border-white/10 px-3 py-3 text-sm text-white/35">
                            No direct dependency mapped.
                          </div>
                        ) : (
                          selectedDependencies.map((item) => (
                            <div
                              key={item.id}
                              className="flex items-center gap-2 rounded-2xl border border-sky-400/15 bg-sky-500/[0.045] p-2"
                            >
                              <button
                                type="button"
                                onClick={() => selectNode(item.id)}
                                className="min-w-0 flex-1 rounded-xl px-2 py-1.5 text-left transition hover:bg-white/5"
                              >
                                <div className="truncate text-sm font-medium text-white/85">
                                  {item.name}
                                </div>
                                <div className="truncate text-xs text-white/40">
                                  {item.path}
                                </div>
                              </button>

                              <Button
                                type="button"
                                onClick={() => enterNode(item.id)}
                                className="h-8 rounded-xl border border-white/10 bg-white/5 px-2 text-xs text-white hover:bg-white/10"
                              >
                                Enter
                              </Button>
                            </div>
                          ))
                        )}
                      </div>
                    </section>

                    <section>
                      <div className="mb-2 flex items-center justify-between">
                        <h3 className="text-sm font-semibold text-amber-100">
                          Used by
                        </h3>
                        <span className="text-xs text-white/40">
                          {selectedUsedBy.length}
                        </span>
                      </div>

                      <div className="space-y-2">
                        {selectedUsedBy.length === 0 ? (
                          <div className="rounded-2xl border border-dashed border-white/10 px-3 py-3 text-sm text-white/35">
                            No mapped item directly uses this node.
                          </div>
                        ) : (
                          selectedUsedBy.map((item) => (
                            <div
                              key={item.id}
                              className="flex items-center gap-2 rounded-2xl border border-amber-400/15 bg-amber-500/[0.045] p-2"
                            >
                              <button
                                type="button"
                                onClick={() => selectNode(item.id)}
                                className="min-w-0 flex-1 rounded-xl px-2 py-1.5 text-left transition hover:bg-white/5"
                              >
                                <div className="truncate text-sm font-medium text-white/85">
                                  {item.name}
                                </div>
                                <div className="truncate text-xs text-white/40">
                                  {item.path}
                                </div>
                              </button>

                              <Button
                                type="button"
                                onClick={() => enterNode(item.id)}
                                className="h-8 rounded-xl border border-white/10 bg-white/5 px-2 text-xs text-white hover:bg-white/10"
                              >
                                Enter
                              </Button>
                            </div>
                          ))
                        )}
                      </div>
                    </section>
                  </div>
                </div>
              </FloatingPanel>
            </motion.aside>
          )}
        </AnimatePresence>

        {!mounted ? (
          <div className="flex h-full items-center justify-center">
            <Card className="border-white/10 bg-white/[0.04] text-white shadow-2xl backdrop-blur-xl">
              <CardContent className="flex items-center gap-3 p-5">
                <Sparkles className="h-5 w-5 animate-pulse text-violet-200" />
                <span className="text-sm text-white/70">Loading map...</span>
              </CardContent>
            </Card>
          </div>
        ) : (
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onPaneClick={clearSelection}
            onPaneContextMenu={(event) => {
              event.preventDefault();
              clearSelection();
            }}
            fitView
            fitViewOptions={{ padding: 0.22 }}
            minZoom={0.15}
            maxZoom={1.6}
            panOnScroll
            proOptions={{ hideAttribution: true }}
            defaultEdgeOptions={{
              type: "smoothstep",
              markerEnd: {
                type: MarkerType.ArrowClosed,
              },
            }}
          >
            <MiniMap
              pannable
              zoomable
              className="!bottom-4 !right-4 !h-36 !w-56 !rounded-3xl !border !border-white/10 !bg-zinc-950/80 !backdrop-blur-xl"
              nodeStrokeColor={() => "rgba(255,255,255,0.18)"}
              nodeColor={() => "rgba(255,255,255,0.16)"}
              maskColor="rgba(0,0,0,0.52)"
            />

            <Controls className="[&>button]:!border-white/10 [&>button]:!bg-zinc-950/80 [&>button]:!text-white [&>button:hover]:!bg-zinc-800" />

            <Background
              variant={BackgroundVariant.Dots}
              gap={22}
              size={1.2}
              color="rgba(255,255,255,0.12)"
            />
          </ReactFlow>
        )}
      </section>
    </main>
  );
}
