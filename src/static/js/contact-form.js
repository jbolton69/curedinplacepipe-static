document.addEventListener('DOMContentLoaded', function() {
    const form = document.getElementById('quote_form');
    
    if (form) {
        form.addEventListener('submit', function(e) {
            e.preventDefault();
            
            // Get form data
            const formData = {
                name: document.querySelector('input[name="name"]').value,
                email: document.querySelector('input[name="email"]').value,
                phone: document.querySelector('input[name="phone"]').value,
                city: document.querySelector('input[name="city"]').value,
                state: document.querySelector('input[name="state"]').value,
                project_details: document.querySelector('textarea[name="message"]').value,
                _token: '{{ csrf_token() }}'
            };
            
            // Hide any previous alerts
            document.getElementById('quote_error').style.display = 'none';
            document.getElementById('quote_success').style.display = 'none';
            
            // Show loading state on button
            const submitButton = document.getElementById('quote_submit');
            const originalText = submitButton.innerHTML;
            submitButton.disabled = true;
            submitButton.innerHTML = 'Sending...';
            
            // Send to Laravel
            fetch('/contact/submit', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRF-TOKEN': document.querySelector('meta[name="csrf-token"]').content
                },
                body: JSON.stringify(formData)
            })
            .then(response => response.json())
            .then(data => {
                submitButton.disabled = false;
                submitButton.innerHTML = originalText;
                
                if (data.success) {
                    // Show success message
                    document.getElementById('quote_success').style.display = 'block';
                    document.getElementById('quote_success').innerHTML = data.message;
                    
                    // Reset form
                    form.reset();
                    
                    // Scroll to success message
                    document.getElementById('quote_success').scrollIntoView({ behavior: 'smooth' });
                } else {
                    // Show error
                    document.getElementById('quote_error').style.display = 'block';
                    document.getElementById('quote_error').innerHTML = data.message || 'An error occurred. Please try again.';
                }
            })
            .catch(error => {
                submitButton.disabled = false;
                submitButton.innerHTML = originalText;
                
                document.getElementById('quote_error').style.display = 'block';
                document.getElementById('quote_error').innerHTML = 'An error occurred. Please try again.';
                
                console.error('Error:', error);
            });
        });
    }
});