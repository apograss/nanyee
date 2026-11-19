package de.nanyee.app

import kotlinx.serialization.json.*
import java.time.Instant
import java.util.UUID

internal class DemoCabinBackend : PlatformBackend {
    private var signedIn = false
    private val credentials = mutableListOf<JsonObject>()
    private val jobs = mutableListOf<JsonObject>()
    private val submissions = mutableMapOf<String, Pair<JsonObject, JsonObject>>()
    private val cabins = JsonArray((1..4).map { buildJsonObject { put("dev_id", it); put("name", "演示学习舱 $it") } })
    override suspend fun clearLocal() { signedIn = false }
    override suspend fun call(method: String, path: String, body: JsonObject?, key: String?): JsonElement {
        if (path == "/study-cabin/cabins") return cabins
        if (path == "/auth/login") signedIn = true
        if (!signedIn) throw PlatformFailure(401, "AUTHENTICATION_REQUIRED", "请登录演示平台账号。")
        return when {
            path == "/auth/login" || path == "/auth/me" -> buildJsonObject {
                put("csrf_header", platformCsrfHeader)
                putJsonObject("user") {
                    put("id", "00000000-0000-4000-8000-000000000001"); put("username", "demo"); put("nickname", "演示同学")
                    put("email", JsonNull); put("email_verified", false); put("role", "student"); put("status", "active"); put("registration_trust_level", "community_quiz")
                }
            }
            path == "/auth/logout" -> { clearLocal(); JsonNull }
            path == "/credentials" && method == "GET" -> JsonArray(credentials)
            path == "/credentials" -> {
                val value = buildJsonObject {
                    put("id", UUID.randomUUID().toString()); put("purpose", "study_cabin"); put("upstream", "infospace"); put("status", "active")
                    put("expires_at", JsonNull); put("created_at", Instant.now().toString()); put("last_used_at", JsonNull)
                    put("consent_version", "credential-hosting-v1"); put("metadata", body?.get("metadata") ?: JsonObject(emptyMap()))
                }
                credentials.add(value); value
            }
            path.startsWith("/credentials/") -> {
                val index = credentials.indexOfFirst { it.text("id") == path.split('/')[2] }
                require(index >= 0)
                val value = JsonObject(credentials[index] + if (method == "DELETE") mapOf("status" to JsonPrimitive("revoked")) else mapOf("metadata" to (body?.get("metadata") ?: credentials[index]["metadata"]!!)))
                credentials[index] = value
                if (method == "DELETE") value else JsonObject(value + ("resumed_job_id" to JsonNull))
            }
            path == "/jobs" && method == "GET" -> JsonArray(jobs)
            path == "/jobs" -> {
                requireNotNull(body); requireNotNull(key)
                submissions[key]?.let { (previous, result) ->
                    if (previous != body) throw PlatformFailure(409, "CONFLICT", "幂等键冲突。")
                    return jobs.first { it.text("id") == result.text("id") }
                }
                require(credentials.any { it.text("id") == body.text("credential_id") && it.text("status") == "active" })
                val value = buildJsonObject {
                    put("id", UUID.randomUUID().toString()); put("tool_id", body["tool_id"]!!); put("operation", body["operation"]!!)
                    put("state", "queued"); put("payload", body["payload"]!!); put("credential_id", body["credential_id"]!!)
                    put("scheduled_for", body["scheduled_for"]!!); put("attempt_count", 0); put("max_attempts", 1440)
                    put("cancel_requested_at", JsonNull); put("receipt", JsonNull); put("error_code", JsonNull); put("next_action", JsonNull)
                    val now = Instant.now().toString()
                    put("created_at", now); put("updated_at", now)
                }
                jobs.add(0, value); submissions[key] = body to value; value
            }
            path.endsWith("/cancel") -> {
                val index = jobs.indexOfFirst { it.text("id") == path.split('/')[2] }
                require(index >= 0)
                val now = JsonPrimitive(Instant.now().toString())
                val value = JsonObject(jobs[index] + mapOf("state" to JsonPrimitive("cancelled"), "cancel_requested_at" to now, "updated_at" to now))
                jobs[index] = value; value
            }
            else -> error("不支持的演示操作")
        }
    }
    fun advance(id: String, state: String) {
        val index = jobs.indexOfFirst { it.text("id") == id }
        require(index >= 0)
        val job = jobs[index]
        val request = job["payload"]?.obj() ?: JsonObject(emptyMap())
        val cabinId = request["cabin_ids"]!!.jsonArray.first().jsonPrimitive.int
        val cabin = cabins.objectList().first { it.number("dev_id") == cabinId }
        val receipt = buildJsonObject {
            put("dev_id", cabinId); put("room_name", cabin.text("name")); put("target_date", request.text("target_date"))
            put("start_time", request.text("start_time")); put("end_time", request.text("end_time"))
        }
        jobs[index] = JsonObject(job + mapOf(
            "state" to JsonPrimitive(state), "receipt" to if (state == "succeeded") receipt else JsonNull,
            "next_action" to if (state == "verification_required") JsonPrimitive("verify_upstream") else JsonNull,
            "error_code" to when (state) { "verification_required" -> JsonPrimitive("RESULT_UNKNOWN"); "failed" -> JsonPrimitive("ATTEMPT_WINDOW_EXPIRED"); else -> JsonNull },
            "attempt_count" to JsonPrimitive(job.number("attempt_count") + 1), "updated_at" to JsonPrimitive(Instant.now().toString())
        ))
    }
}
