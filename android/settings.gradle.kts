pluginManagement { repositories { google(); maven("https://maven-central.storage-download.googleapis.com/maven2"); mavenCentral(); gradlePluginPortal() } }
dependencyResolutionManagement { repositories { google(); maven("https://maven-central.storage-download.googleapis.com/maven2"); mavenCentral() } }
rootProject.name = "Nanyee"
include(":app")
