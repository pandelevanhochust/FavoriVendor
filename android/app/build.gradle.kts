import java.util.Properties

plugins {
    id("com.android.application")
}

// Đọc cấu hình riêng của máy từ local.properties (file này KHÔNG commit lên git).
val localProps = Properties().apply {
    val f = rootProject.file("local.properties")
    if (f.exists()) f.inputStream().use { load(it) }
}
fun prop(name: String, default: String): String = localProps.getProperty(name, default)

android {
    namespace = "com.example.vietqrapp"
    compileSdk = 34

    defaultConfig {
        applicationId = "com.example.vietqrapp"
        minSdk = 24
        targetSdk = 34
        versionCode = 1
        versionName = "1.0"

        buildConfigField("String", "SERVER_BASE_URL", "\"${prop("kiosk.serverUrl", "https://your-server.example.com/")}\"")
        buildConfigField("String", "KIOSK_API_KEY", "\"${prop("kiosk.apiKey", "CHANGE_ME")}\"")
        buildConfigField("String", "DEVICE_ID", "\"${prop("kiosk.deviceId", "kiosk-01")}\"")
    }

    buildFeatures {
        viewBinding = true
        buildConfig = true
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}

dependencies {
    implementation("androidx.appcompat:appcompat:1.6.1")
    implementation("com.google.android.material:material:1.11.0")
    implementation("androidx.coordinatorlayout:coordinatorlayout:1.2.0")

    implementation("androidx.lifecycle:lifecycle-viewmodel:2.7.0")
    implementation("androidx.lifecycle:lifecycle-livedata:2.7.0")

    implementation("com.squareup.retrofit2:retrofit:2.9.0")
    implementation("com.squareup.retrofit2:converter-gson:2.9.0")
    implementation("com.google.code.gson:gson:2.10.1")
    implementation("com.squareup.okhttp3:logging-interceptor:4.12.0")

    // Vẽ QR từ chuỗi payload
    implementation("com.google.zxing:core:3.5.3")
}
