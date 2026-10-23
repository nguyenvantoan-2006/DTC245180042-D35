// ==============================================================================
// Script Quản lý Đồng hồ Đếm ngược, Tương tác Bài thi & Modal Xác nhận Nộp bài
// Tuân thủ 100% CSP (Content-Security-Policy), không dùng inline script/handler
// ==============================================================================

document.addEventListener('DOMContentLoaded', () => {
  const timerElement = document.getElementById('quiz-timer');
  const quizForm = document.getElementById('quiz-form');
  const btnOpenModal = document.getElementById('btn-open-submit-modal');
  const modalOverlay = document.getElementById('submit-confirm-modal');
  const btnCancelModal = document.getElementById('btn-cancel-modal');
  const btnConfirmSubmit = document.getElementById('btn-confirm-submit');
  const progressBar = document.getElementById('quiz-progress-bar');
  const answeredCountEl = document.getElementById('answered-count-text');
  const modalSummaryText = document.getElementById('modal-summary-text');
  const modalWarningBadge = document.getElementById('modal-warning-badge');

  if (!quizForm) return;

  const questionBlocks = document.querySelectorAll('.question-block');
  const totalQuestions = questionBlocks.length;
  let isSubmitting = false;

  // 1. Cập nhật tiến độ khi thí sinh chọn đáp án
  function updateProgress() {
    let answered = 0;
    questionBlocks.forEach((block) => {
      const checkedRadio = block.querySelector('input[type="radio"]:checked');
      if (checkedRadio) {
        answered++;
        block.classList.add('answered');
      } else {
        block.classList.remove('answered');
      }

      // Tô sáng option được chọn
      block.querySelectorAll('.option-item').forEach(item => {
        const radio = item.querySelector('input[type="radio"]');
        if (radio && radio.checked) {
          item.classList.add('selected');
        } else {
          item.classList.remove('selected');
        }
      });
    });

    const percent = totalQuestions > 0 ? Math.round((answered / totalQuestions) * 100) : 0;
    if (progressBar) {
      progressBar.style.width = percent + '%';
    }
    if (answeredCountEl) {
      answeredCountEl.textContent = `Đã làm ${answered}/${totalQuestions} câu (${percent}%)`;
    }

    return { answered, remaining: totalQuestions - answered };
  }

  // Gắn sự kiện click / change cho các đáp án
  quizForm.addEventListener('change', (e) => {
    if (e.target.type === 'radio') {
      updateProgress();
    }
  });

  // Gọi lần đầu để đồng bộ trạng thái
  updateProgress();

  // 2. Quản lý Đồng hồ Đếm ngược
  let remainingSeconds = 15 * 60;
  if (timerElement) {
    const durationMin = parseInt(timerElement.getAttribute('data-duration'), 10) || 15;
    remainingSeconds = durationMin * 60;

    function updateTimerDisplay() {
      const minutes = Math.floor(remainingSeconds / 60);
      const seconds = remainingSeconds % 60;
      timerElement.textContent = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;

      // Dưới 2 phút đổi màu đỏ cảnh báo
      if (remainingSeconds <= 120) {
        timerElement.classList.add('danger');
      }

      // Hết giờ -> Tự động nộp bài
      if (remainingSeconds <= 0) {
        clearInterval(timerInterval);
        isSubmitting = true;
        if (modalOverlay) modalOverlay.classList.remove('active');
        quizForm.submit();
      }
      remainingSeconds--;
    }

    updateTimerDisplay();
    const timerInterval = setInterval(updateTimerDisplay, 1000);
  }

  // 3. Xử lý Custom Modal Xác nhận Nộp bài
  if (btnOpenModal && modalOverlay) {
    btnOpenModal.addEventListener('click', (e) => {
      e.preventDefault();
      const stats = updateProgress();

      if (modalSummaryText) {
        modalSummaryText.textContent = `Bạn đã hoàn thành ${stats.answered} trên tổng số ${totalQuestions} câu hỏi.`;
      }

      if (modalWarningBadge) {
        if (stats.remaining > 0) {
          modalWarningBadge.style.display = 'block';
          modalWarningBadge.textContent = `⚠️ Lưu ý: Bạn còn ${stats.remaining} câu chưa chọn đáp án!`;
        } else {
          modalWarningBadge.style.display = 'none';
        }
      }

      modalOverlay.classList.add('active');
    });

    if (btnCancelModal) {
      btnCancelModal.addEventListener('click', () => {
        modalOverlay.classList.remove('active');
      });
    }

    modalOverlay.addEventListener('click', (e) => {
      if (e.target === modalOverlay) {
        modalOverlay.classList.remove('active');
      }
    });
  }

  // Khi bấm "Xác nhận nộp bài" trong modal
  if (btnConfirmSubmit) {
    btnConfirmSubmit.addEventListener('click', () => {
      isSubmitting = true;
      btnConfirmSubmit.disabled = true;
      btnConfirmSubmit.textContent = 'Đang chấm điểm...';
      if (btnCancelModal) btnCancelModal.style.display = 'none';
      quizForm.submit();
    });
  }

  // Fallback: Nếu form submit trực tiếp
  quizForm.addEventListener('submit', () => {
    isSubmitting = true;
  });

  // Cảnh báo người dùng khi vô tình đóng tab khi đang làm bài
  window.addEventListener('beforeunload', (e) => {
    if (!isSubmitting && remainingSeconds > 0) {
      e.preventDefault();
      e.returnValue = 'Bài thi đang diễn ra. Nếu rời trang, tiến trình của bạn có thể bị mất!';
    }
  });
});
