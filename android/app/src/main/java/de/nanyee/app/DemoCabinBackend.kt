package de.nanyee.app

import kotlinx.serialization.json.*
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
            path == "/auth/login" || path == "/auth/me" -> buildJsonObject { putJsonObject("user") { put("nickname", "演示同学") } }
            path == "/auth/logout" -> { clearLocal(); JsonNull }
            path == "/credentials" && method == "GET" -> JsonArray(credentials)
            path == "/credentials" -> {
                val value = buildJsonObject { put("id", UUID.randomUUID().toString()); put("purpose", "study_cabin"); put("upstream", "infospace"); put("status", "active"); put("metadata", body?.get("metadata") ?: JsonObject(emptyMap())) }
                credentials.add(value); value
            }
            path.startsWith("/credentials/") -> {
                val index = credentials.indexOfFirst { it.text("id") == path.split('/')[2] }
                require(index >= 0)
                val value = JsonObject(credentials[index] + if (method == "DELETE") mapOf("status" to JsonPrimitive("revoked")) else mapOf("metadata" to (body?.get("metadata") ?: JsonObject(emptyMap()))))
                credentials[index] = value; value
            }
            path == "/jobs" && method == "GET" -> JsonArray(jobs)
            path == "/jobs" -> {
                requireNotNull(body); requireNotNull(key)
                submissions[key]?.let { (previous, result) ->
                    if (previous != body) throw PlatformFailure(409, "CONFLICT", "幂等键冲突。")
                    return jobs.first { it.text("id") == result.text("id") }
                }
                require(credentials.any { it.text("id") == body.text("credential_id") && it.text("status") == "active" })
                val value = JsonObject(body + mapOf("id" to JsonPrimitive(UUID.randomUUID().toString()), "state" to JsonPrimitive("queued")))
                jobs.add(0, value); submissions[key] = body to value; value
            }
            path.endsWith("/cancel") -> {
                val index = jobs.indexOfFirst { it.text("id") == path.split('/')[2] }
                require(index >= 0)
                val value = JsonObject(jobs[index] + ("state" to JsonPrimitive("cancelled")))
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
        val receipt = buildJsonObject {
            put("room_name", "演示学习舱"); put("target_date", request.text("target_date"))
            put("start_time", request.text("start_time")); put("end_time", request.text("end_time"))
        }
        jobs[index] = JsonObject(job + mapOf("state" to JsonPrimitive(state), "receipt" to if (state == "succeeded") receipt else JsonNull, "next_action" to if (state == "verification_required") JsonPrimitive("verify_upstream") else JsonNull))
    }
}
