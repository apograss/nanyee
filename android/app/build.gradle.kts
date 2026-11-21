plugins {
    id("com.android.application")
    kotlin("android")
    kotlin("plugin.compose")
    kotlin("plugin.serialization")
}
android {
    namespace = "de.nanyee.app"
    compileSdk = 35
    defaultConfig { applicationId = "de.nanyee.app"; minSdk = 26; targetSdk = 35; versionCode = 100; versionName = "1.0.0" }
    buildFeatures { compose = true; buildConfig = true }
    compileOptions { sourceCompatibility = JavaVersion.VERSION_17; targetCompatibility = JavaVersion.VERSION_17 }
    kotlinOptions { jvmTarget = "17" }
    sourceSets.getByName("test").resources.srcDir("src/main/assets")
    val signing = listOf("NANYEE_KEYSTORE_FILE", "NANYEE_KEYSTORE_PASSWORD", "NANYEE_KEY_ALIAS", "NANYEE_KEY_PASSWORD")
        .associateWith { providers.gradleProperty(it).orElse(providers.environmentVariable(it)).orNull?.takeIf(String::isNotBlank) }
    val releaseKeyAvailable = signing.values.all { it != null }
    signingConfigs.create("release") {
        if (releaseKeyAvailable) {
            storeFile = file(signing.getValue("NANYEE_KEYSTORE_FILE")!!)
            storePassword = signing.getValue("NANYEE_KEYSTORE_PASSWORD")
            keyAlias = signing.getValue("NANYEE_KEY_ALIAS")
            keyPassword = signing.getValue("NANYEE_KEY_PASSWORD")
        }
    }
    if (!releaseKeyAvailable) logger.warn("Nanyee: release signing credentials absent/incomplete; using debug signing. Do not publish this APK.")
    buildTypes {
        getByName("release") {
            isMinifyEnabled = true
            isShrinkResources = true
            signingConfig = signingConfigs.getByName(if (releaseKeyAvailable) "release" else "debug")
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
            ndk { abiFilters += providers.gradleProperty("releaseAbis").orElse("arm64-v8a,armeabi-v7a").get().split(',') }
        }
    }
}
configurations.matching { it.name.endsWith("UnitTestRuntimeClasspath") || it.name.endsWith("UnitTestCompileClasspath") }.configureEach {
    exclude(group = "com.microsoft.onnxruntime", module = "onnxruntime-android")
}
dependencies {
    implementation(platform("androidx.compose:compose-bom:2024.12.01"))
    implementation("androidx.activity:activity-compose:1.9.3")
    implementation("androidx.compose.material3:material3")
    implementation("androidx.compose.material:material-icons-extended")
    implementation("androidx.lifecycle:lifecycle-viewmodel-compose:2.8.7")
    implementation("com.squareup.okhttp3:okhttp:4.12.0")
    implementation("org.jetbrains.kotlinx:kotlinx-serialization-json:1.7.3")
    implementation("androidx.security:security-crypto:1.1.0-alpha06")
    implementation("com.microsoft.onnxruntime:onnxruntime-android:1.23.2")
    implementation("org.jsoup:jsoup:1.18.3")
    implementation("com.journeyapps:zxing-android-embedded:4.3.0")
    testImplementation("junit:junit:4.13.2")
    testImplementation("com.microsoft.onnxruntime:onnxruntime:1.23.2")
}
