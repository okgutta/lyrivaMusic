import React from "react";
import ReactDOM from "react-dom/client";
import { flushSync } from "react-dom";
import { PopupModal } from "../components/Modal.ts";
import SettingsPanel from "../components/ReactComponents/SettingsPanel/index.tsx";

const MODAL_ID = "settingsPanel";

/** 渲染一个面板进一次性容器 + root（同步渲染，弹窗不闪空帧） */
function renderPanel(element: React.ReactElement) {
  const container = document.createElement("div");
  // 注意：不要用 .sl-sp-page —— 那是右侧内容块的类（带 max-width），
  // 撞名会把整个面板容器压到 680px
  container.className = "sl-sp-panel";
  const root = ReactDOM.createRoot(container);
  try {
    flushSync(() => root.render(element));
  } catch (error) {
    // 渲染抛错时给出可见错误，而不是静默白屏（弹窗仍会显示错误文本）
    console.error("[Settings] 渲染设置面板失败:", error);
    try {
      container.textContent = `设置面板渲染失败：${error instanceof Error ? error.message : String(error)}`;
    } catch {
      /* ignore */
    }
  }
  return { container, root };
}

function showSettingsPanel() {
  const { container, root } = renderPanel(React.createElement(SettingsPanel));
  PopupModal.display({
    title: "lyrivaMusic 设置",
    content: container,
    isLarge: true,
    modalId: MODAL_ID,
    onClose: () => root.unmount(),
  });
}

export function openSettingsPanel() {
  showSettingsPanel();
}
