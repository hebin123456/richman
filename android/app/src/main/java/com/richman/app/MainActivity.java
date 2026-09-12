package com.richman.app;

import android.content.Context;
import android.os.Bundle;
import android.util.Log;

import androidx.annotation.Nullable;

import com.getcapacitor.BridgeActivity;

import java.io.BufferedInputStream;
import java.io.BufferedOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;

/**
 * 掌上大富翁 — 安卓宿主。
 *
 * 采用"本地内嵌服务"架构:
 *  1) 把打包进 assets/nodejs-project 的 Next.js standalone 服务复制到可写目录 filesDir。
 *  2) 用 nodejs-mobile 的核心(node::Start)在后台线程启动该服务,监听 127.0.0.1:10086。
 *  3) 后台线程轮询 HTTP 健康检查,就绪后归还主线程;主线程等待放行后再让 Capacitor
 *     加载页面(Capacitor server.url 已指向 http://127.0.0.1:10086),从而避免
 *     WebView 在服务未就绪时出现 ERR_CONNECTION_REFUSED。
 */
public class MainActivity extends BridgeActivity {

    private static final String TAG = "Richman";
    private static final int NODE_PORT = 10086;
    private static final String NODE_DIR_NAME = "nodejs-project";
    private static final long START_TIMEOUT_MS = 25_000;

    // nodejs-mobile 一个进程内只能启动一个实例
    private static boolean nodeStarted = false;

    static {
        try {
            // native-lib link 了 libnode;显式 load node 以确保其可用
            System.loadLibrary("native-lib");
            System.loadLibrary("node");
        } catch (UnsatisfiedLinkError e) {
            Log.e(TAG, "Failed to load native libs:", e);
        }
    }

    private native int startNodeWithArguments(String[] arguments);

    @Override
    protected void onCreate(@Nullable Bundle savedInstanceState) {
        // 先确保 Node 服务就绪,再进入 super(super 会加载 Capacitor 配置的 server.url)
        if (!nodeStarted) {
            nodeStarted = true;
            if (!startEmbeddedServer()) {
                Log.e(TAG, "Embedded node server did NOT become ready in time.");
            }
        }
        super.onCreate(savedInstanceState);
    }

    private boolean startEmbeddedServer() {
        final Context ctx = getApplicationContext();
        final CountDownLatch ready = new CountDownLatch(1);
        final boolean[] result = {false};

        new Thread(() -> {
            try {
                final File nodeDir = ensureNodeProject(ctx);
                ensureDatabase(ctx);
                final String dbAbs = new File(ctx.getFilesDir(), "dev.db").getAbsolutePath();
                final File bootstrap = writeBootstrap(nodeDir, dbAbs);

                Log.i(TAG, "Starting embedded node server at " + nodeDir.getAbsolutePath() +
                        " with db " + dbAbs);

                Thread serverThread = new Thread(() -> {
                    try {
                        startNodeWithArguments(new String[]{
                                "node",
                                bootstrap.getAbsolutePath(),
                        });
                    } catch (Throwable t) {
                        Log.e(TAG, "node::Start returned/errored", t);
                    }
                }, "node-embed");
                serverThread.start();

                // 轮询 HTTP 健康检查直到服务就绪
                long deadline = System.currentTimeMillis() + START_TIMEOUT_MS;
                while (System.currentTimeMillis() < deadline) {
                    if (isServerUp()) {
                        result[0] = true;
                        break;
                    }
                    Thread.sleep(500);
                }
            } catch (Throwable t) {
                Log.e(TAG, "Embedded server bootstrap failed", t);
            } finally {
                ready.countDown();
            }
        }, "richman-bootstrap").start();

        try {
            ready.await(START_TIMEOUT_MS + 5000, TimeUnit.MILLISECONDS);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
        return result[0];
    }

    /**
     * 生成 bootstrap.js:在 require server.js 之前注入运行环境变量,
     * 这样不依赖任何额外的原生环境变量注入机制。
     */
    private File writeBootstrap(File nodeDir, String dbAbs) {
        File bs = new File(nodeDir, "bootstrap.js");
        String content = "'use strict';\n" +
                "process.env.NODE_ENV = 'production';\n" +
                "process.env.PORT = '" + NODE_PORT + "';\n" +
                "process.env.HOSTNAME = '127.0.0.1';\n" +
                "process.env.DATABASE_URL = 'file:" + dbAbs.replaceAll("'", "") + "';\n" +
                "require('./server.js');\n";
        try (OutputStream os = new BufferedOutputStream(new FileOutputStream(bs, false))) {
            os.write(content.getBytes("UTF-8"));
        } catch (Exception e) {
            Log.e(TAG, "writeBootstrap failed", e);
        }
        return bs;
    }

    private File ensureNodeProject(Context ctx) {
        File dest = new File(ctx.getFilesDir(), NODE_DIR_NAME);
        // 复用已复制好的服务,避免每次冷启动都复制较大体积。需要强制刷新时删除该目录即可。
        if (dest.exists() && new File(dest, "server.js").isFile()) {
            return dest;
        }
        copyAssetDirectory(ctx, NODE_DIR_NAME, dest);
        return dest;
    }

    /** 首次启动时把预置数据库复制到可写目录(已有则复用)。 */
    private void ensureDatabase(Context ctx) {
        try {
            File db = new File(ctx.getFilesDir(), "dev.db");
            if (db.isFile()) return;
            copyAssetFile(ctx, "dev.db", db);
            Log.i(TAG, "Seeded initial database.");
        } catch (Exception e) {
            Log.e(TAG, "Failed to copy seeded database; server will create a fresh one.", e);
        }
    }

    private boolean isServerUp() {
        HttpURLConnection conn = null;
        try {
            URL url = new URL("http://127.0.0.1:" + NODE_PORT + "/");
            conn = (HttpURLConnection) url.openConnection();
            conn.setConnectTimeout(1500);
            conn.setReadTimeout(1500);
            return conn.getResponseCode() == 200;
        } catch (Exception e) {
            return false;
        } finally {
            if (conn != null) conn.disconnect();
        }
    }

    private static void copyAssetDirectory(Context ctx, String assetPath, File destDir) {
        try {
            copyAssetDir(ctx, assetPath, destDir);
        } catch (Exception e) {
            Log.e(TAG, "Failed to copy node project from assets", e);
        }
    }

    private static void copyAssetDir(Context ctx, String assetPath, File destDir) throws Exception {
        String[] children = ctx.getAssets().list(assetPath);
        if (children == null || children.length == 0) {
            File out = new File(destDir.getParentFile(), new File(assetPath).getName());
            copyAssetFile(ctx, assetPath, out);
            return;
        }
        if (!destDir.exists()) destDir.mkdirs();
        for (String child : children) {
            copyAssetDir(ctx, assetPath + "/" + child, new File(destDir, child));
        }
    }

    private static void copyAssetFile(Context ctx, String assetPath, File out) throws Exception {
        if (out.getParentFile() != null) out.getParentFile().mkdirs();
        try (InputStream is = new BufferedInputStream(ctx.getAssets().open(assetPath));
             OutputStream os = new BufferedOutputStream(new FileOutputStream(out))) {
            byte[] buf = new byte[16 * 1024];
            int n;
            while ((n = is.read(buf)) > 0) {
                os.write(buf, 0, n);
            }
        }
    }
}