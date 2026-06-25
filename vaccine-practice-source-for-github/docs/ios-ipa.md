# iOS IPA 打包说明

这个项目已经接入 Capacitor，可以把现有的刷题网页应用打进 iOS App 壳里。题库数据、150 道随机组卷、单选/多选/判断和错题记录都来自当前 React 项目。

## Windows 上先同步

在项目目录运行：

```powershell
npm.cmd run mobile:sync
```

这个命令会先构建网页应用，再把 `dist` 文件同步到 `ios/App/App/public`。当前这一步已经在 Windows 上验证通过。

## 为什么还需要 Mac

`.ipa` 需要 iOS 原生工程构建产物。Windows 可以准备 Capacitor/iOS 工程，但不能运行 Apple 的 `xcodebuild`，所以最终出 IPA 需要 macOS + Xcode，或者 macOS 云构建。

## 没有 Mac：用 GitHub Actions 云构建

项目里已经加入：

```text
.github/workflows/build-ios-ipa.yml
```

把整个项目上传到 GitHub 仓库后，进入仓库页面：

1. 打开 `Actions`。
2. 选择 `Build iOS IPA`。
3. 点击 `Run workflow`。
4. 等构建完成后，在构建详情底部下载 `vaccine-practice-ios-ipa`。

下载下来的压缩包里会有：

```text
vaccine-practice.ipa
```

这个文件拿去 TrollStore/巨魔安装测试。

## 给 TrollStore/巨魔用的脚本

把整个项目复制到 Mac 后，在项目目录运行：

```bash
npm install
chmod +x scripts/build_ios_ipa.sh
./scripts/build_ios_ipa.sh
```

脚本会：

1. 构建刷题前端。
2. 同步到 iOS 工程。
3. 使用 Xcode 构建 `App.app`。
4. 打包成 `Payload/App.app` 结构的 IPA。

输出文件：

```text
build/ios/vaccine-practice.ipa
```

这个 IPA 就是给 TrollStore/巨魔安装用的目标文件。

## 手动打开 Xcode

如果你想手动检查 iOS 工程：

```bash
npm install
npm run mobile:sync
npx cap open ios
```

项目打开后，选择 `App` scheme。Bundle ID 是：

```text
com.local.vaccinepractice
```

## 项目信息

- App 名称：预防接种刷题
- iOS 工程：`ios/App/App.xcodeproj`
- Web 构建目录：`dist`
- iOS 同步目录：`ios/App/App/public`
