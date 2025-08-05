document.addEventListener('DOMContentLoaded', () => {
  // Ví dụ khởi tạo biểu đồ đơn giản bằng Chart.js (nếu đã include Chart.js)
  if (window.Chart) {
    const ctx = document.getElementById('lineChart').getContext('2d');
    new Chart(ctx, {
      type: 'line',
      data: {
        labels: ['Tháng 1', 'Tháng 2', 'Tháng 3', 'Tháng 4', 'Tháng 5', 'Tháng 6'],
        datasets: [{
          label: 'Lương (triệu ₫)',
          data: [200, 180, 220, 240, 260, 280],
          fill: false,
          borderWidth: 2,
          tension: 0.3
        }]
      },
      options: {
        responsive: true,
        scales: {
          y: {
            beginAtZero: false
          }
        },
        plugins: {
          legend: {
            display: true,
            position: 'top'
          }
        }
      }
    });
  }
});