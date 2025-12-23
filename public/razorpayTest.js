const ORDER_ID = "6945428ca6955b94c762a9a5"; // MongoDB order _id
const JWT_TOKEN = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjY5NDUwNWEzNDg3M2UwYzY1OGY4ZmMxZiIsImlhdCI6MTc2NjIxMzg0NywiZXhwIjoxNzY2MjE0NzQ3fQ.r-oTAyuMn3xNbSPWYV8t3P0KncuM6cjcMT20nTbD2jw";

document.getElementById("pay-btn").addEventListener("click", payNow);

async function payNow() {
  try {
    //  CREATE Razorpay order (BACKEND)
    const res = await fetch(
      `http://localhost:5000/api/payments/${ORDER_ID}/create`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${JWT_TOKEN}`
        }
      }
    );

    if (!res.ok) {
      const err = await res.text();
      console.error("Create failed:", err);
      return;
    }

    const data = await res.json(); //  data IS DEFINED HERE
    console.log("Create response:", data);

    //  OPEN Razorpay checkout
    const options = {
      key: data.keyId,
      amount: data.amount,
      currency: data.currency,
      order_id: data.razorpayOrderId,
      name: "Velvet Tails",
      description: "Sandbox Payment",
      handler: async function (response) {
        console.log("Payment response:", response);

        //  VERIFY payment
        const verifyRes = await fetch(
          `http://localhost:5000/api/payments/${ORDER_ID}/verify`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${JWT_TOKEN}`
            },
            body: JSON.stringify(response)
          }
        );

        const verifyData = await verifyRes.json();
        console.log("Verify response:", verifyData);
        alert("Payment successful!");
      },
      theme: { color: "#3399cc" }
    };

    const rzp = new Razorpay(options);
    rzp.open();

  } catch (err) {
    console.error("Payment error:", err);
  }
}
