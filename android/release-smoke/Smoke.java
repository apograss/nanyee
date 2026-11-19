package de.nanyee.smoke;

import android.app.Activity;
import android.app.Instrumentation;
import android.content.Intent;
import android.os.Bundle;
import java.io.InputStream;
import java.nio.FloatBuffer;
import java.util.Arrays;
import java.util.Collections;
import java.util.Optional;

public final class Smoke extends Instrumentation {
    @Override public void onCreate(Bundle arguments) { super.onCreate(arguments); start(); }

    @Override public void onStart() {
        Bundle result = new Bundle();
        try {
            ClassLoader loader = getTargetContext().getClassLoader();
            Class<?> environmentClass = loader.loadClass("ai.onnxruntime.OrtEnvironment");
            Class<?> tensorClass = loader.loadClass("ai.onnxruntime.OnnxTensor");
            Object environment = environmentClass.getMethod("getEnvironment").invoke(null);
            byte[] model;
            try (InputStream asset = getTargetContext().getAssets().open("captcha_model.onnx")) {
                model = readAll(asset);
            }
            try (AutoCloseable session = (AutoCloseable) environmentClass.getMethod("createSession", byte[].class).invoke(environment, model);
                 AutoCloseable tensor = (AutoCloseable) tensorClass.getMethod("createTensor", environmentClass, FloatBuffer.class, long[].class)
                     .invoke(null, environment, FloatBuffer.allocate(28 * 80), new long[] {1, 1, 28, 80});
                 AutoCloseable output = (AutoCloseable) session.getClass().getMethod("run", java.util.Map.class)
                     .invoke(session, Collections.singletonMap("image", tensor))) {
                Object digits = ((Optional<?>) output.getClass().getMethod("get", String.class).invoke(output, "digits")).get();
                Object info = tensorClass.getMethod("getInfo").invoke(digits);
                long[] shape = (long[]) info.getClass().getMethod("getShape").invoke(info);
                if (!Arrays.equals(shape, new long[] {1, 4, 10})) throw new AssertionError("Wrong OCR output shape");
                FloatBuffer values = (FloatBuffer) tensorClass.getMethod("getFloatBuffer").invoke(digits);
                if (values.remaining() != 40) throw new AssertionError("Wrong OCR output length");
                while (values.hasRemaining()) if (!Float.isFinite(values.get())) throw new AssertionError("Non-finite OCR output");
            }
            Intent intent = getTargetContext().getPackageManager().getLaunchIntentForPackage("de.nanyee.app");
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TASK);
            Activity activity = startActivitySync(intent);
            waitForIdleSync();
            if (activity == null || activity.isFinishing()) throw new AssertionError("Activity did not launch");
            result.putString("stream", "PASS: release ONNX JNI/model inference [1,4,10]; MainActivity launched\n");
            finish(Activity.RESULT_OK, result);
        } catch (Throwable error) {
            result.putString("stream", "FAIL: " + error.toString() + "\n");
            finish(Activity.RESULT_CANCELED, result);
        }
    }

    private static byte[] readAll(InputStream stream) throws java.io.IOException {
        java.io.ByteArrayOutputStream bytes = new java.io.ByteArrayOutputStream();
        byte[] buffer = new byte[8192];
        int count;
        while ((count = stream.read(buffer)) != -1) bytes.write(buffer, 0, count);
        return bytes.toByteArray();
    }
}
