结论：通过（阻断全部关闭，同意进入 fm-verify）
版本：975c1e2（6a35682..975c1e2，2 文件 +7/-4，均在 apps/h5）   我执行了：pnpm lint exit 0；pnpm -r exec tsc --noEmit exit 0；pnpm test 710 passed/3 failed exit 1（2 文件 = a3 B3/B4 + migration「存量 CookLog 回填」，均既有挂账、无新增）
序列确认：初次 GET 失败时 feedbackError 非空、弹层不挂载；loadFeedback 先 setFeedback 再清 error，重读成功后首次挂载即带服务端值预填，不会空表单覆盖（dish L184-196、L423-430）；历史缺餐 tag 已优先「没排上」（history L56-59）
阻断问题：无；未发现新回归（三份 Popup 常驻仅 display:none；pendingReadback 只读不写；401/关闭提交竞态沿用原处理）
风险/未验证：页面截图、最后按钮可见性、真实库反馈回读仍未验证（fm-verify 必测「回读失败→重读成功→开记一笔」）；当前第 1 层，验收后到第 2 层
