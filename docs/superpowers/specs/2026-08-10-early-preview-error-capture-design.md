# 预览入口早期错误捕获设计

## 背景

Make 预览页把管理端 runtime 注入在预览 loader 前面，但注入脚本会先异步加载 bootstrap。预览入口的 ES module 在这段等待期间继续执行；入口依赖解析失败时，React ErrorBoundary 尚未创建，Quick Edit runtime 也尚未注册全局错误监听器，因此页面只留下 Vite 错误而没有 Axhub 错误反馈。

## 目标

- 在管理 runtime bootstrap 等待期间同步捕获 `error` 与 `unhandledrejection`。
- Quick Edit runtime 加载后复用现有资源错误、Vite 诊断、一次性瞬态重试和错误弹窗逻辑。
- 不改变当前首次瞬态 Vite 错误自动刷新一次、重复失败再弹窗的行为。
- Quick Edit runtime 加载失败时不阻塞原型首屏，也不新增依赖。

## 方案

管理端注入器在异步 IIFE 之前初始化一个带上限的全局早期捕获状态，状态包含队列、捕获监听器和停止函数。事件被规范化为普通对象，资源目标保留 `tagName`、`src`、`href`，错误对象与位置字段原样保留，最多保存 50 条。

Quick Edit runtime 注册正式监听器后读取并清空早期队列，先停止早期监听器，再逐条调用与实时事件相同的处理函数。这样入口 loader 的资源错误仍会进入现有瞬态恢复和 Vite 入口诊断分支，普通运行时异常仍会显示现有弹窗。

## 测试

- 注入器测试验证：bootstrap Promise 未完成时，两个早期监听器已经存在，并且可将事件排队。
- Quick Edit runtime 测试验证：启动时消费队列、停止早期监听器并显示现有错误弹窗。
- 运行 Make Client 注入测试、Make Server runtime 测试，并重新执行 `check-app-ready` 验证 `home-pilot`。
