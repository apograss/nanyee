package de.nanyee.app

import androidx.compose.foundation.Image
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.rememberTransformableState
import androidx.compose.foundation.gestures.transformable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.pager.HorizontalPager
import androidx.compose.foundation.pager.PagerState
import androidx.compose.foundation.pager.rememberPagerState
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Close
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.unit.IntSize
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties

@Composable
internal fun RainSlides(state: RainState) {
    val deck = state.presentation ?: return
    if (deck.slides.isEmpty()) { Text("暂无幻灯片"); return }
    val pager = key(deck.id) { rememberPagerState(initialPage = state.slide) { deck.slides.size } }
    var fullscreen by remember(deck.id) { mutableStateOf(false) }
    LaunchedEffect(state.slide, deck.id) { if (pager.currentPage != state.slide) pager.scrollToPage(state.slide) }
    LaunchedEffect(pager, deck.id) {
        snapshotFlow { pager.currentPage }.collect { index ->
            if (index != state.slide) { state.updateFollow(false); state.selectSlide(index) }
        }
    }
    if (!fullscreen) SlidePager(state, pager, false, Modifier.fillMaxWidth().aspectRatio(4f / 3f)) { fullscreen = true }
    else {
        Spacer(Modifier.fillMaxWidth().aspectRatio(4f / 3f))
        Dialog(onDismissRequest = { fullscreen = false }, properties = DialogProperties(usePlatformDefaultWidth = false, decorFitsSystemWindows = false)) {
            Surface(Modifier.fillMaxSize(), color = Color.Black, contentColor = Color.White) {
                Column(Modifier.fillMaxSize().systemBarsPadding()) {
                    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                        IconButton(onClick = { fullscreen = false }) { Icon(Icons.Outlined.Close, "退出全屏") }
                        Text("${pager.currentPage + 1}/${deck.slides.size}")
                    }
                    SlidePager(state, pager, true, Modifier.weight(1f).fillMaxWidth()) { }
                }
            }
        }
    }
    Row(Modifier.fillMaxWidth().padding(horizontal = 16.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
        Text(state.lessonTitle.ifBlank { deck.title }, Modifier.weight(1f), style = MaterialTheme.typography.bodyMedium, maxLines = 1, overflow = TextOverflow.Ellipsis)
        Text("${pager.currentPage + 1}/${deck.slides.size}", style = MaterialTheme.typography.labelMedium)
        FilterChip(selected = state.follow, onClick = { state.updateFollow(!state.follow) }, enabled = !state.busy, label = { Text("跟随") })
    }
}

@Composable
@OptIn(ExperimentalFoundationApi::class)
private fun SlidePager(state: RainState, pager: PagerState, zoomable: Boolean, modifier: Modifier, onTap: () -> Unit) {
    var scale by remember(pager.currentPage, zoomable) { mutableFloatStateOf(1f) }
    var offset by remember(pager.currentPage, zoomable) { mutableStateOf(Offset.Zero) }
    var size by remember { mutableStateOf(IntSize.Zero) }
    val currentBitmap = state.slideImage(pager.currentPage)
    val drawn = fittedSlideSize(size.width, size.height, currentBitmap?.width ?: 0, currentBitmap?.height ?: 0)
    LaunchedEffect(size, drawn, scale) {
        offset = Offset(clampSlidePan(offset.x, scale, size.width, drawn.first), clampSlidePan(offset.y, scale, size.height, drawn.second))
    }
    val transform = rememberTransformableState { zoom, pan, _ ->
        scale = (scale * zoom).coerceIn(1f, 4f)
        offset = Offset(clampSlidePan(offset.x + pan.x, scale, size.width, drawn.first), clampSlidePan(offset.y + pan.y, scale, size.height, drawn.second))
    }
    HorizontalPager(state = pager, beyondViewportPageCount = 2, userScrollEnabled = scale == 1f, modifier = modifier.onSizeChanged {
        size = it
    }.background(if (zoomable) Color.Black else MaterialTheme.colorScheme.surfaceContainerHigh)) { page ->
        Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
            val bitmap = state.slideImage(page)
            if (bitmap == null) {
                if (page == state.slide && state.error.isNotBlank()) Text("图片暂不可用")
                else CircularProgressIndicator(Modifier.size(24.dp))
            } else Image(bitmap.asImageBitmap(), "幻灯片第 ${page + 1} 页", contentScale = ContentScale.Fit,
                modifier = Modifier.fillMaxSize().then(if (zoomable) Modifier.transformable(transform, canPan = { scale > 1f }).graphicsLayer { scaleX = scale; scaleY = scale; translationX = offset.x; translationY = offset.y } else Modifier.clickable(onClick = onTap)))
        }
    }
}
